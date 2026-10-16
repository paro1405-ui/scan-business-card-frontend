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
  backendOverride = ''; // Use current page origin by default when deployed
  productionBackend = 'https://bettertogethercardscanner.com';
  eventName = '';
  eventList: Array<{ id: number; event_name: string; isactive: boolean }> = [];
  eventLoading = false;
  selectedEventName = '';
  customEventName = '';
  showEventModal = false;
  eventModalError = '';
  eventSaving = false;
  isSaving = false;
  scanBy = '';
  showDeleteEventModal = false;
  deleteEventList: Array<{ id: number; event_name: string; isactive: boolean }> = [];
  selectedDeleteEventId: number | null = null;
  deleteEventEmail = '';
  deleteEventLoading = false;
  deleteEventSaving = false;
  deleteEventError = '';
  private readonly authorizedDeleteEmails = ['parosaw55@gmail.com', 'anuraggunjan@gmail.com'];
  manualData: any = {
    name: '',
    designation: '',
    phone: '',
    email: '',
    company: '',
    website: '',
    address: '',
    city: '',
    state: '',
    rank: ''
  };

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    const saved = localStorage.getItem('backendOverride');
    if (saved) {
      this.backendOverride = saved;
    }

    const storedEvent = localStorage.getItem('selectedEventName');

    // Get event name from URL query parameters
    this.route.queryParams.subscribe(params => {
      const queryEvent = params['event'];
      if (queryEvent) {
        this.eventName = queryEvent;
        localStorage.setItem('selectedEventName', this.eventName);
        this.showEventModal = false;
      } else if (storedEvent) {
        this.eventName = storedEvent;
        this.showEventModal = false;
      } else {
        // No event set — show modal immediately and then load active events.
        this.showEventModal = true;
        this.eventModalError = '';
        this.selectedEventName = '';
        this.loadActiveEvents();
      }

      console.log('Event from URL:', this.eventName);
    });

    const storedScanBy = localStorage.getItem('scanBy');
    if (storedScanBy) {
      this.scanBy = storedScanBy;
    }
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

    // When developing locally (frontend usually served on localhost:4200),
    // point backend to localhost:3000 by default for convenience.
    try {
      const host = window.location.hostname;
      const port = window.location.port;

      if (port === '4200' || host === 'localhost' || host.startsWith('127.')) {
        return 'http://localhost:3000';
      }

      // For deployed environments, prefer an explicit production backend
      // if configured (e.g. your production IP), otherwise fall back to
      // same-host with backendPort.
      if (this.productionBackend && this.productionBackend.trim().length) {
        return this.productionBackend.replace(/\/$/, '');
      }

      const proto = window.location.protocol || 'https:';
      return `${proto}//${host}:${this.backendPort}`;
    } catch (e) {
      return window.location.origin;
    }
  }

  get backendUrl() {
    return `${this.backendOrigin}/api/scan-card?event=${encodeURIComponent(this.eventName)}`;
  }

  loadActiveEvents() {
    this.eventModalError = '';
    this.eventLoading = true;
    this.http.get<Array<{ id: number; event_name: string; isactive: boolean }>>(`${this.backendOrigin}/api/events?active=true`)
      .subscribe({
        next: (events) => {
          this.eventList = events;
          this.eventLoading = false;
          this.selectedEventName = events.length > 0
            ? (this.eventName || events[0].event_name)
            : '__custom__';
          if (!this.eventName) {
            this.showEventModal = true;
          }
        },
        error: (err) => {
          console.error('Error loading active events:', err);
          this.eventLoading = false;
          this.eventModalError = 'Unable to load event list. Please refresh or try again later.';
          this.selectedEventName = '__custom__';
          if (!this.eventName) {
            this.showEventModal = true;
          }
        }
      });
  }

  openEventModal() {
    this.customEventName = '';
    // prefill scanBy from storage if available
    const stored = localStorage.getItem('scanBy');
    if (stored) this.scanBy = stored;
    this.showEventModal = true;

    if (this.eventList.length === 0) {
      this.selectedEventName = '__custom__';
      this.loadActiveEvents();
      return;
    }

    this.selectedEventName = this.eventName || this.eventList[0]?.event_name || '';
  }

  confirmEventSelection() {
    if (this.eventSaving) {
      return;
    }

    if (this.eventList.length > 0 && !this.selectedEventName) {
      return;
    }

    if (this.selectedEventName === '__custom__') {
      const txt = (this.customEventName || '').trim();
      if (!txt) {
        this.eventModalError = 'Please enter a name for the custom event';
        return;
      }
      this.eventModalError = '';
      this.eventSaving = true;
      this.http.post<{ id: number; event_name: string; isactive: boolean }>(`${this.backendOrigin}/api/events`, {
        event_name: txt
      }).subscribe({
        next: (event) => {
          if (!this.eventList.some(existing => existing.id === event.id)) {
            this.eventList = [...this.eventList, event];
          }
          this.completeEventSelection(event.event_name);
          this.eventSaving = false;
        },
        error: (err) => {
          console.error('Error saving event:', err);
          this.eventModalError = err.error?.error || 'Unable to save the event. Please try again.';
          this.eventSaving = false;
        }
      });
      return;
    } else if (this.selectedEventName) {
      this.eventName = this.selectedEventName;
    } else if (!this.eventName) {
      this.eventName = 'default';
    }

    this.completeEventSelection(this.eventName);
  }

  private completeEventSelection(eventName: string) {
    this.eventName = eventName;
    localStorage.setItem('selectedEventName', this.eventName);
    // persist who is scanning
    if (this.scanBy && this.scanBy.trim().length) {
      localStorage.setItem('scanBy', this.scanBy.trim());
    }
    this.showEventModal = false;
    window.history.replaceState(null, '', `${window.location.pathname}?event=${encodeURIComponent(this.eventName)}`);
  }

  get confirmEnabled(): boolean {
    if (!this.selectedEventName) return false;
    if (this.selectedEventName === '__custom__') {
      return !!(this.customEventName && this.customEventName.trim().length);
    }
    if (this.eventList.length > 0) {
      return true;
    }
    return false;
  }

  cancelEventSelection() {
    if (!this.eventName) {
      return;
    }
    this.showEventModal = false;
  }

  get canDeleteEvent(): boolean {
    return this.selectedDeleteEventId !== null
      && this.authorizedDeleteEmails.includes(this.deleteEventEmail.trim().toLowerCase());
  }

  openDeleteEventModal() {
    this.showDeleteEventModal = true;
    this.deleteEventList = [];
    this.selectedDeleteEventId = null;
    this.deleteEventEmail = '';
    this.deleteEventError = '';
    this.deleteEventLoading = true;
    this.http.get<Array<{ id: number; event_name: string; isactive: boolean }>>(`${this.backendOrigin}/api/events?active=true`)
      .subscribe({
        next: (events) => {
          this.deleteEventList = events;
          this.selectedDeleteEventId = events[0]?.id ?? null;
          this.deleteEventLoading = false;
        },
        error: (err) => {
          console.error('Error loading events for deletion:', err);
          this.deleteEventError = 'Unable to load events. Please try again.';
          this.deleteEventLoading = false;
        }
      });
  }

  closeDeleteEventModal() {
    this.showDeleteEventModal = false;
  }

  deleteSelectedEvent() {
    if (!this.canDeleteEvent || this.deleteEventSaving || this.selectedDeleteEventId === null) {
      return;
    }

    const eventToDelete = this.deleteEventList.find(event => event.id === this.selectedDeleteEventId);
    if (!eventToDelete) {
      this.deleteEventError = 'Select an event from the list.';
      return;
    }

    this.deleteEventSaving = true;
    this.deleteEventError = '';
    this.http.delete<{ id: number; event_name: string; isactive: boolean }>(`${this.backendOrigin}/api/events/${eventToDelete.id}`, {
      body: { email: this.deleteEventEmail.trim() }
    }).subscribe({
      next: (updatedEvent) => {
        this.deleteEventList = this.deleteEventList.map(event =>
          event.id === updatedEvent.id ? updatedEvent : event
        );
        this.deleteEventSaving = false;
        this.showDeleteEventModal = false;

        if (this.eventName === eventToDelete.event_name) {
          this.eventName = '';
          localStorage.removeItem('selectedEventName');
          window.history.replaceState(null, '', window.location.pathname);
          this.showEventModal = true;
          this.loadActiveEvents();
        }
      },
      error: (err) => {
        console.error('Error deactivating event:', err);
        this.deleteEventError = err.error?.error || 'Unable to deactivate the event. Please try again.';
        this.deleteEventSaving = false;
      }
    });
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

    if (this.uploadType === 'manual') {
      // Prepare blank manual entry form with event-specific fields
      this.initializeManualData();
      this.closeCamera();
    }
  }

  initializeManualData() {
    this.manualData = {
      name: '',
      designation: '',
      phone: '',
      email: '',
      company: '',
      website: '',
      address: '',
      city: '',
      state: '',
      rank: ''
    };
  }

  isIWSEvent(): boolean {
    if (!this.eventName) {
      return false;
    }
    const normalized = this.eventName.trim().toLowerCase().replace(/\s+/g, '');
    return normalized === 'iws';
  }

  isPoliceExpoEvent(): boolean {
    if (!this.eventName) {
      return false;
    }
    const normalized = this.eventName.trim().toLowerCase().replace(/\s+/g, '');
    return normalized === 'policeexpo';
  }

  isSpecialEvent(): boolean {
    return this.isIWSEvent() || this.isPoliceExpoEvent();
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
      event_name: this.eventName,
      scan_by: this.scanBy
    };

    this.isSaving = true;

    this.http.post(`${this.backendOrigin}/api/save-data`, submissionData)
      .subscribe({
        next: (res: any) => {
          this.isSaving = false;
          alert('✅ Data saved successfully!');
          console.log('Save response:', res);
          this.startOver();
        },
        error: (err) => {
          console.log(err)
          this.isSaving = false;
          console.error('Error saving data:', err);
          alert('❌ Failed to save data. Please try again.');
        }
      });
  }

  submitManualData() {
    const submissionData = {
      ...this.manualData,
      remarks: this.remark,
      event_name: this.eventName,
      scan_by: this.scanBy
    };

    this.isSaving = true;

    this.http.post(`${this.backendOrigin}/api/save-data`, submissionData)
      .subscribe({
        next: (res: any) => {
          this.isSaving = false;
          alert('✅ Member saved successfully!');
          console.log('Save response:', res);
          this.startOver();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Error saving manual data:', err);
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
    this.initializeManualData();
    this.closeCamera();
  }

  resetResult() {
    this.result = null;
    this.remark = '';
  }
}