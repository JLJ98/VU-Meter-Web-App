class VUMeter {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.audioElement = document.getElementById('audioElement');
        this.isRunning = false;
        this.animationId = null;
        
        // VU meter elements
        this.leftNeedle = document.getElementById('leftNeedle');
        this.rightNeedle = document.getElementById('rightNeedle');
        this.leftCanvas = document.getElementById('leftMeter');
        this.rightCanvas = document.getElementById('rightMeter');
        
        // Controls
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.audioFileInput = document.getElementById('audioFile');
        this.sensitivitySlider = document.getElementById('sensitivity');
        this.ballisticsSelect = document.getElementById('ballistics');
        
        // VU meter state
        this.leftLevel = 0;
        this.rightLevel = 0;
        this.leftPeak = 0;
        this.rightPeak = 0;
        this.sensitivity = 1;
        this.ballistics = 'vu';
        
        // Ballistics parameters
        this.ballisticsConfig = {
            vu: { attack: 0.003, release: 0.3, peakHold: 1000 },    // Musical VU response
            ppm: { attack: 0.01, release: 0.05, peakHold: 500 },   // Fast PPM response  
            slow: { attack: 0.001, release: 0.1, peakHold: 2000 }  // Slow response
        };
        
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
        ctx.clearRect(0, 0, width, height);
        
        // Draw meter background
        const gradient = ctx.createRadialGradient(width/2, height, 0, width/2, height, height);
        gradient.addColorStop(0, 'rgba(0, 26, 26, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 8, 8, 0.9)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Draw scale markings
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.textAlign = 'center';
        
        const centerX = width / 2;
        const centerY = height - 10;
        const radius = height - 30;
        
        // VU scale: -20, -10, -7, -5, -3, -1, 0, +1, +2, +3 dB
        const scaleMarks = [
            { db: -20, angle: -90, label: '-20' },
            { db: -10, angle: -60, label: '-10' },
            { db: -7, angle: -45, label: '-7' },
            { db: -5, angle: -30, label: '-5' },
            { db: -3, angle: -15, label: '-3' },
            { db: -1, angle: -5, label: '-1' },
            { db: 0, angle: 0, label: '0' },
            { db: 1, angle: 15, label: '+1' },
            { db: 2, angle: 30, label: '+2' },
            { db: 3, angle: 45, label: '+3' }
        ];
        
        scaleMarks.forEach(mark => {
            const angleRad = (mark.angle * Math.PI) / 180;
            const x1 = centerX + Math.cos(angleRad) * (radius - 20);
            const y1 = centerY - Math.sin(angleRad) * (radius - 20);
            const x2 = centerX + Math.cos(angleRad) * (radius - 10);
            const y2 = centerY - Math.sin(angleRad) * (radius - 10);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Add labels
            const labelX = centerX + Math.cos(angleRad) * (radius - 35);
            const labelY = centerY - Math.sin(angleRad) * (radius - 35);
            ctx.fillText(mark.label, labelX, labelY + 3);
        });
        
        // Draw "VU" label
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = 'rgba(0, 255, 255, 1)';
        ctx.fillText('VU', centerX, centerY - radius + 40);
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startAudio());
        this.stopBtn.addEventListener('click', () => this.stopAudio());
        this.audioFileInput.addEventListener('change', (e) => this.loadAudioFile(e));
        this.sensitivitySlider.addEventListener('input', (e) => {
            this.sensitivity = parseFloat(e.target.value);
        });
        this.ballisticsSelect.addEventListener('change', (e) => {
            this.ballistics = e.target.value;
        });
    }
    
    async startAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.setupAnalyser();
            this.connectAudio(this.microphone);
            
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.animate();
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions.');
        }
    }
    
    async loadAudioFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const url = URL.createObjectURL(file);
            this.audioElement.src = url;
            this.audioElement.load();
            
            await new Promise((resolve) => {
                this.audioElement.addEventListener('canplaythrough', resolve, { once: true });
            });
            
            const source = this.audioContext.createMediaElementSource(this.audioElement);
            this.setupAnalyser();
            this.connectAudio(source);
            
            // Connect to speakers
            source.connect(this.audioContext.destination);
            
            this.audioElement.play();
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.animate();
            
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('Could not load audio file.');
        }
    }
    
    setupAnalyser() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.1;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }
    
    connectAudio(source) {
        // Create a splitter for stereo analysis
        this.splitter = this.audioContext.createChannelSplitter(2);
        this.leftAnalyser = this.audioContext.createAnalyser();
        this.rightAnalyser = this.audioContext.createAnalyser();
        
        this.leftAnalyser.fftSize = 1024;
        this.rightAnalyser.fftSize = 1024;
        this.leftAnalyser.smoothingTimeConstant = 0.1;
        this.rightAnalyser.smoothingTimeConstant = 0.1;
        
        source.connect(this.splitter);
        this.splitter.connect(this.leftAnalyser, 0);
        this.splitter.connect(this.rightAnalyser, 1);
        
        this.leftDataArray = new Uint8Array(this.leftAnalyser.frequencyBinCount);
        this.rightDataArray = new Uint8Array(this.rightAnalyser.frequencyBinCount);
    }
    
    stopAudio() {
        this.isRunning = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
        
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        
        // Reset needles
        this.leftLevel = 0;
        this.rightLevel = 0;
        this.updateNeedles();
    }
    
    animate() {
        if (!this.isRunning) return;
        
        this.analyzeAudio();
        this.updateNeedles();
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    analyzeAudio() {
        if (!this.leftAnalyser || !this.rightAnalyser) return;
        
        this.leftAnalyser.getByteFrequencyData(this.leftDataArray);
        this.rightAnalyser.getByteFrequencyData(this.rightDataArray);
        
        // Calculate RMS values for musical response
        const leftRMS = this.calculateRMS(this.leftDataArray);
        const rightRMS = this.calculateRMS(this.rightDataArray);
        
        // Convert to dB and apply sensitivity
        const leftDB = this.rmsToDb(leftRMS) * this.sensitivity;
        const rightDB = this.rmsToDb(rightRMS) * this.sensitivity;
        
        // Apply ballistics
        const config = this.ballisticsConfig[this.ballistics];
        
        // Attack and release
        if (leftDB > this.leftLevel) {
            this.leftLevel += (leftDB - this.leftLevel) * config.attack;
        } else {
            this.leftLevel += (leftDB - this.leftLevel) * config.release;
        }
        
        if (rightDB > this.rightLevel) {
            this.rightLevel += (rightDB - this.rightLevel) * config.attack;
        } else {
            this.rightLevel += (rightDB - this.rightLevel) * config.release;
        }
        
        // Clamp values
        this.leftLevel = Math.max(-60, Math.min(6, this.leftLevel));
        this.rightLevel = Math.max(-60, Math.min(6, this.rightLevel));
    }
    
    calculateRMS(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = dataArray[i] / 255;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / dataArray.length);
    }
    
    rmsToDb(rms) {
        if (rms === 0) return -60;
        return 20 * Math.log10(rms);
    }
    
    updateNeedles() {
        // Convert dB to needle angle (-90° to +90°)
        const leftAngle = this.dbToAngle(this.leftLevel);
        const rightAngle = this.dbToAngle(this.rightLevel);
        
        this.leftNeedle.style.transform = `translateX(-50%) rotate(${leftAngle}deg)`;
        this.rightNeedle.style.transform = `translateX(-50%) rotate(${rightAngle}deg)`;
    }
    
    dbToAngle(db) {
        // Map dB range (-60 to +6) to angle range (-90° to +90°)
        const normalizedDb = Math.max(-60, Math.min(6, db));
        const angle = ((normalizedDb + 60) / 66) * 180 - 90;
        return angle;
    }
}

// Initialize the VU meter when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VUMeter();
});