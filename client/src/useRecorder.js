import { useEffect, useRef, useState } from 'react';

// Real recording through the browser: laptop webcam + mic (video) or mic only (audio).
export default function useRecorder({ video }) {
  const streamRef = useRef(); const recRef = useRef(); const chunks = useRef([]);
  const [stream, setStream] = useState(null);
  const [state, setState] = useState('idle'); // idle | live | recording | recorded
  const [blob, setBlob] = useState(null); const [url, setUrl] = useState(null);
  const [sec, setSec] = useState(0); const [error, setError] = useState(''); const [cameras, setCameras] = useState([]);

  const release = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setStream(null); };
  useEffect(() => release, []);
  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function open(deviceId) {
    release();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: true, video: video ? (deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720 }) : false });
      streamRef.current = s; setStream(s); setError(''); setState('live');
      if (video) setCameras((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
      return s;
    } catch (e) {
      setError(!navigator.mediaDevices ? 'Recording needs https or localhost.'
        : e.name === 'NotAllowedError' ? 'Access was blocked. Allow camera and microphone in your browser settings, then try again.'
        : e.name === 'NotFoundError' ? 'No camera or microphone was found on this device.'
        : `Could not start recording: ${e.message}`);
    }
  }

  function start() {
    chunks.current = []; setSec(0);
    const types = video ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const b = new Blob(chunks.current, { type: r.mimeType });
      setBlob(b); setUrl(URL.createObjectURL(b)); setState('recorded'); release();
    };
    r.start(1000); recRef.current = r; setState('recording');
  }

  const stop = () => recRef.current?.stop();
  const reset = () => { url && URL.revokeObjectURL(url); setBlob(null); setUrl(null); setSec(0); setState('idle'); };
  const close = () => { release(); setState('idle'); };
  return { state, stream, blob, url, sec, error, cameras, open, start, stop, reset, close };
}
