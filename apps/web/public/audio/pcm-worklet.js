// Runs off the main thread (AudioWorkletGlobalScope) so mic capture never
// blocks UI rendering. Converts the Web Audio API's Float32 samples to the
// 16-bit signed PCM AssemblyAI's streaming API expects, batching into
// ~100ms frames before handing them to the main thread — see
// use-live-transcription.ts, which loads this module via
// audioContext.audioWorklet.addModule("/audio/pcm-worklet.js").
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._chunks = [];
    this._bufferedSamples = 0;
    // `sampleRate` is the AudioWorkletGlobalScope global — equal to the
    // AudioContext's configured sample rate (forced to 16000 by the caller).
    this._targetSamples = Math.floor(sampleRate * 0.1);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    this._chunks.push(Float32Array.from(channel));
    this._bufferedSamples += channel.length;

    if (this._bufferedSamples >= this._targetSamples) {
      const merged = new Float32Array(this._bufferedSamples);
      let offset = 0;
      for (const chunk of this._chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const pcm16 = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i++) {
        const sample = Math.max(-1, Math.min(1, merged[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      this._chunks = [];
      this._bufferedSamples = 0;
    }

    return true;
  }
}

registerProcessor("pcm-recorder-processor", PCMRecorderProcessor);
