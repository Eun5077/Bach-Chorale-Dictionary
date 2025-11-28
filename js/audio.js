// Global audio engine
const piano = new Tone.Sampler({
  urls: {
    A0: "A0.mp3",
    C1: "C1.mp3",
    "D#1": "Ds1.mp3",
    "F#1": "Fs1.mp3",
    A1: "A1.mp3",
    C2: "C2.mp3",
    "D#2": "Ds2.mp3",
    "F#2": "Fs2.mp3",
    A2: "A2.mp3",
    C3: "C3.mp3",
    "D#3": "Ds3.mp3",
    "F#3": "Fs3.mp3",
    A3: "A3.mp3",
    C4: "C4.mp3",
    "D#4": "Ds4.mp3",
    "F#4": "Fs4.mp3",
    A4: "A4.mp3",
    C5: "C5.mp3",
    "D#5": "Ds5.mp3",
    "F#5": "Fs5.mp3",
    A5: "A5.mp3",
    C6: "C6.mp3",
    "D#6": "Ds6.mp3",
    "F#6": "Fs6.mp3",
    A6: "A6.mp3",
    C7: "C7.mp3",
    "D#7": "Ds7.mp3",
    "F#7": "Fs7.mp3",
    A7: "A7.mp3",
    C8: "C8.mp3",
  },
  baseUrl: "https://tonejs.github.io/audio/salamander/",
  onload: () => {
    console.log("Piano samples loaded");
  },
}).toDestination();

let currentNoteData = null;
let currentParts = [];
let isToneReady = false;

// Voice(S, A, T, B = 0,1,2,3)
const voiceEnabled = {
  0: true,
  1: true,
  2: true,
  3: true,
};

// Create Tone.Part
function setupToneParts() {
  if (!currentNoteData) return;

  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = currentNoteData.tempo_qpm || 80;

  currentParts.forEach((p) => p.part.dispose());
  currentParts = [];

  currentNoteData.parts.forEach((p) => {
    const events = p.notes.map((n) => ({
      time: n.time,
      pitch: n.pitch,
      duration: n.duration,
    }));

    const part = new Tone.Part((time, event) => {
      if (!voiceEnabled[p.index]) return;
      const freq = Tone.Frequency(event.pitch, "midi");
      piano.triggerAttackRelease(freq, event.duration, time);
    }, events);

    part.start(0);

    currentParts.push({
      index: p.index,
      part,
    });
  });
}

async function loadAudioForChorale(ch) {
  if (!ch || !ch.bwv) return;

  const bwvStr = ch.bwv.toString().replace(".", "_");
  const url = `./data/audio_notes/bwv${bwvStr}.json`;

  try {
    const res = await fetch(url);
    currentNoteData = await res.json();
    setupToneParts();
  } catch (e) {
    console.error("Audio JSON load error:", e);
  }
}

window.loadAudioForChorale = loadAudioForChorale;

// Transport control
async function startTransport() {
  if (!isToneReady) {
    await Tone.start();
    isToneReady = true;
  }
  Tone.Transport.start();
}

function stopTransport() {
  Tone.Transport.stop();
}

function initGlobalAudioControls() {
  const btnPlay = document.getElementById("btn-play");
  const btnStop = document.getElementById("btn-stop");

  if (btnPlay) {
    btnPlay.addEventListener("click", () => {
      startTransport();
    });
  }

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      stopTransport();
    });
  }

  const earBtnPlay = document.getElementById("ear-btn-play");
  const earBtnStop = document.getElementById("ear-btn-stop");

  if (earBtnPlay) {
    earBtnPlay.addEventListener("click", () => {
      startTransport();
    });
  }

  if (earBtnStop) {
    earBtnStop.addEventListener("click", () => {
      stopTransport();
    });
  }

  const allVoiceCheckboxes = document.querySelectorAll(
    ".voice-check, .ear-voice-check"
  );

  allVoiceCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const index = Number(checkbox.dataset.index);
      voiceEnabled[index] = checkbox.checked;
    });
  });
}

document.addEventListener("DOMContentLoaded", initGlobalAudioControls);
