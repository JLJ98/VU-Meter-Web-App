// meter-processor.js
// True VU integration in the audio thread.
// 0 VU calibration defaults to -18 dBFS.

class VUMeterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return []; }

  constructor(options) {
    super();

    const opt = (options && options.processorOptions) || {};
    this.sampleRate = sampleRate; // global provided by engine
    this.cal = typeof opt.calibration === 'number' ? opt.calibration : -18; // dBFS at 0 VU
    this.tau = typeof opt.tau === 'number' ? opt.tau : 0.300; // 300ms classic VU
    this.eps = 1e-12;

    // VU envelopes (dB)
    this.envL = -60;
    this.envR = -60;

    // throttle messages to UI (every N blocks)
    this.blockCount = 0;
    this.postEvery = 6; // ~6*128/48k ≈ 16ms @48kHz

    this.port.start();
  }

  // per-buffer smoothing coefficient for exponential integration
  alphaFor(blockSize) {
    const T = blockSize / this.sampleRate;
    return 1 - Math.exp(-T / this.tau);
  }

  vuForChannel(channel) {
    // RMS of this block
    let sum = 0;
    const n = channel.length;
    for (let i = 0; i < n; i++) {
      const v = channel[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, n)) + this.eps;
    const dbfs = 20 * Math.log10(rms);
    // Convert to VU using calibration: 0 VU when dbfs == cal
    return dbfs - this.cal;
  }

  process(inputs, outputs, parameters) {
    // Inputs: [[ch0, ch1, ...]]
    const input = inputs[0];
    if (!input || input.length === 0) {
      // no signal, decay slowly toward -60 VU
      const a = this.alphaFor(128);
      this.envL += (-60 - this.envL) * a;
      this.envR += (-60 - this.envR) * a;
    } else {
      const chL = input[0] || input[0]; // if mono, reuse
      const chR = input[1] || input[0]; // fallback to L

      const vuL = this.vuForChannel(chL);
      const vuR = this.vuForChannel(chR);

      const a = this.alphaFor(chL.length || 128); // per block alpha
      this.envL += (vuL - this.envL) * a;
      this.envR += (vuR - this.envR) * a;
    }

    // Clamp to meter range
    this.envL = Math.max(-60, Math.min(+6, this.envL));
    this.envR = Math.max(-60, Math.min(+6, this.envR));

    // Throttle UI messages
    if (++this.blockCount >= this.postEvery) {
      this.blockCount = 0;
      this.port.postMessage({ l: this.envL, r: this.envR });
    }

    // No audio output needed for metering
    return true;
  }
}

registerProcessor('vu-meter-processor', VUMeterProcessor);
