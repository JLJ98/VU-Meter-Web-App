class VUMeter {
  constructor() {
    this.audioContext = null;
    this.mediaElementSource = null;
    this.audioElement = document.getElementById('audioElement');

    // UI bits you already have
    this.leftNeedle  = document.getElementById('leftNeedle');
    this.rightNeedle = document.getElementById('rightNeedle');
    this.leftCanvas  = document.getElementById('leftMeter');
    this.rightCanvas = document.getElementById('rightMeter');

    this.startBtn = document.getElementById('startBtn');
    this.stopBtn  = document.getElementById('stopBtn');
    this.audioFileInput = document.getElementById('audioFile');

    // Meter state (from worklet)
    this.leftVU  = -60;
    this.rightVU = -60;

    // Needle state (UI damping)
    this.leftNeedlePos  = -60;
    this.rightNeedlePos = -60;

    // UI damping factor (visual inertia)
    this.uiDamp = 0.28;

    this.isRunning = false;
    this.animationId = null;

    this.initializeCanvases();
    this.bindEvents();
  }

  initializeCanvases() {
    [this.leftCanvas, this.rightCanvas].forEach(canvas => {
      const ctx = canvas.getContext('2d');
      this.drawMeterScale(ctx, canvas.width, canvas.height);
    });
  }

  drawMeterScale(ctx, width, height) {
    // keep your existing scale drawing code here
    ctx.clearRect(0,0,width,height);
    // ... (omitted for brevity — your original draw code is fine)
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startMic());
    this.stopBtn.addEventListener('click',  () => this.stopAudio());
    this.audioFileInput.addEventListener('change', (e) => this.loadFile(e));
  }

  async ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // Load the worklet module ONCE
      await this.audioContext.audioWorklet.addModule('meter-processor.js');
    }
    // Resume if suspended (required for user interaction)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async startMic() {
    try {
      await this.ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
      });
      const mic = this.audioContext.createMediaStreamSource(stream);
      this.buildGraph(mic);
    } catch (e) {
      alert('Microphone permission failed.');
      console.error(e);
    }
  }

  async loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Stop any existing audio first
    if (this.isRunning) {
      this.stopAudio();
    }

    await this.ensureAudioContext();
    const url = URL.createObjectURL(file);
    this.audioElement.src = url;
    
    try {
      await this.audioElement.play();
      
      // Only create source once per audio element
      if (!this.mediaElementSource) {
        this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
        // Connect to speakers so you can hear it
        this.mediaElementSource.connect(this.audioContext.destination);
      }
      
      this.buildGraph(this.mediaElementSource);
    } catch (e) {
      console.error('Audio playback failed:', e);
      alert('Failed to play audio file. Check console for details.');
    }
  }

  buildGraph(sourceNode) {
    // Create the meter worklet node (no outputs)
    this.meterNode = new AudioWorkletNode(this.audioContext, 'vu-meter-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      outputChannelCount: [],
      processorOptions: {
        calibration: -18,  // 0 VU at -18 dBFS
        tau: 0.300         // 300 ms
      }
    });

    // tap the audio into the worklet (parallel to destination)
    sourceNode.connect(this.meterNode);

    // receive continuous, audio-rate-integrated VU values
    this.meterNode.port.onmessage = (e) => {
      const { l, r } = e.data;
      this.leftVU  = l;
      this.rightVU = r;
    };

    // start UI loop
    this.isRunning = true;
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.animate();
  }

  stopAudio() {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    // Stop audio element if playing
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    
    // Disconnect meter node
    if (this.meterNode) {
      this.meterNode.disconnect();
      this.meterNode = null;
    }
    
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;

    // reset needles
    this.leftVU = this.rightVU = -60;
    this.leftNeedlePos = this.rightNeedlePos = -60;
    this.updateNeedles();
  }

  animate() {
    if (!this.isRunning) return;

    // Visual inertia only (audio-rate integration already done in worklet)
    this.leftNeedlePos  += (this.leftVU  - this.leftNeedlePos)  * this.uiDamp;
    this.rightNeedlePos += (this.rightVU - this.rightNeedlePos) * this.uiDamp;

    // Clamp to meter range
    this.leftNeedlePos  = Math.max(-60, Math.min(+6, this.leftNeedlePos));
    this.rightNeedlePos = Math.max(-60, Math.min(+6, this.rightNeedlePos));

    this.updateNeedles();
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  updateNeedles() {
    this.leftNeedle.style.transform  = `translateX(-50%) rotate(${this.dbToAngle(this.leftNeedlePos)}deg)`;
    this.rightNeedle.style.transform = `translateX(-50%) rotate(${this.dbToAngle(this.rightNeedlePos)}deg)`;
  }

  dbToAngle(db) {
    // map -20..+3 VU to -90..+90 deg (you can keep your previous mapping if preferred)
    const minDb = -20, maxDb = +3;
    const minA  = -90, maxA  = +90;
    const t = (db - minDb) / (maxDb - minDb);
    return minA + t * (maxA - minA);
  }
}

document.addEventListener('DOMContentLoaded', () => new VUMeter());
