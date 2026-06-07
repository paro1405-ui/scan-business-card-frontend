import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;

  selectedFile: any;
  cameraActive = false;
  cameraStream: MediaStream | null = null;
  result: any;
  loading = false;
  exporting = false;
  uploadType = '';
  isDragOver = false;
  remark = '';
  backendPort = 3000;
  backendOverride = 'http://13.236.184.70'; // Production backend origin
  eventName = '';

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    const saved = localStorage.getItem('backendOverride');
    if (saved) {
      this.backendOverride = saved;
    }

    // Get event name from URL query parameters
    this.route.queryParams.subscribe(params => {
      this.eventName = params['event'] || 'default';
      console.log('Event from URL:', this.eventName);
    });
  }

  saveBackendOverride() {
    if (this.backendOverride && this.backendOverride.trim().length) {
      this.backendOverride = this.backendOverride.trim();
      localStorage.setItem('backendOverride', this.backendOverride);
    } else {
      this.backendOverride = '';
      localStorage.removeItem('backendOverride');
    }
  }

  get backendOrigin() {
    const override = this.backendOverride?.trim();
    if (override) {
      let normalized = override.replace(/\/$/, '');
      if (!/^https?:\/\//i.test(normalized)) {
        normalized = `http://${normalized}`;
      }
      return normalized;
    }

    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:${this.backendPort}`;
  }

  get backendUrl() {
    return `${this.backendOrigin}/api/scan-card?event=${encodeURIComponent(this.eventName)}`;
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    if (this.selectedFile && this.uploadType) {
      // Auto-trigger scan for upload mode
      if (this.uploadType === 'upload') {
        setTimeout(() => this.processScan(), 300);
      }
      // For scan mode, auto-trigger when file is selected from camera
      else if (this.uploadType === 'scan') {
        this.processScan();
      }
    }
  }

  onUploadTypeChange() {
    this.resetResult();
    if (this.uploadType === 'upload') {
      this.closeCamera();
    }
  }

  async openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.fallbackToNativeCapture();
      return;
    }

    try {
      this.cameraActive = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      this.cameraStream = stream;
      setTimeout(() => {
        if (this.videoRef) {
          const video = this.videoRef.nativeElement;
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      }, 0);
    } catch (err) {
      console.error('Camera open failed:', err);
      this.cameraActive = false;
      this.fallbackToNativeCapture();
    }
  }

  fallbackToNativeCapture() {
    if (this.cameraInput) {
      this.cameraInput.nativeElement.value = '';
      this.cameraInput.nativeElement.click();
      return;
    }

    alert('Unable to access the camera on this device. Please use upload mode.');
  }

  closeCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = null;
    }
    this.cameraActive = false;
  }

  capturePhoto() {
    if (!this.videoRef) {
      return;
    }

    const video = this.videoRef.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) {
      alert('Unable to capture image.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Unable to capture image. Please try again.');
        return;
      }

      this.selectedFile = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      this.closeCamera();
      this.processScan();
    }, 'image/jpeg', 0.92);
  }

  onFileDrop(event: any) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.selectedFile = files[0];
    }
  }

  scanCard() {
    if (!this.uploadType) {
      alert('Please choose Scan or Upload mode first.');
      return;
    }

    if (this.uploadType === 'scan') {
      this.openCamera();
      return;
    }

    if (!this.selectedFile) {
      alert('Please select an image');
      return;
    }

    this.processScan();
  }

  processScan() {
    const formData = new FormData();
    formData.append('image', this.selectedFile);

    this.loading = true;

    this.http.post(this.backendUrl, formData)
      .subscribe({
        next: (res: any) => {
          this.result = res;
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
          alert('Scanning failed. Please try again.');
        }
      });
  }

  submitData() {
    const submissionData = {
      ...this.result,
      remarks: this.remark,
      event_name: this.eventName
    };

    this.loading = true;

    this.http.post(`${this.backendOrigin}/api/save-data`, submissionData)
      .subscribe({
        next: (res: any) => {
          this.loading = false;
          alert('✅ Data saved successfully!');
          console.log('Save response:', res);
          this.startOver();
        },
        error: (err) => {
          console.log(err)
          this.loading = false;
          console.error('Error saving data:', err);
          alert('❌ Failed to save data. Please try again.');
        }
      });
  }

  exportData() {
    this.exporting = true;

    const exportUrl = `${this.backendOrigin}/api/export-data?event=${encodeURIComponent(this.eventName)}`;

    this.http.get(exportUrl, {
      responseType: 'blob',
      observe: 'response'
    }).subscribe({
      next: (response: any) => {
        this.exporting = false;
        const blob = new Blob([response.body], { type: 'text/csv' });
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `business_cards_${this.eventName}.csv`;

        if (contentDisposition) {
          const match = /filename="?([^";]+)"?/.exec(contentDisposition);
          if (match && match[1]) {
            filename = match[1];
          }
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.exporting = false;
        console.error('Error exporting data:', err);
        alert('❌ Failed to export data. Please try again.');
      }
    });
  }

  startOver() {
    this.selectedFile = null;
    this.result = null;
    this.remark = '';
    this.closeCamera();
  }

  resetResult() {
    this.result = null;
    this.remark = '';
  }
}