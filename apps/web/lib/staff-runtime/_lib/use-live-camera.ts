"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  capturePhotoFromVideo,
  waitForNextAnimationFrame,
} from "./shift-photo";

export type LiveCameraState =
  | "idle"
  | "starting"
  | "ready"
  | "capturing"
  | "error";

export type LiveCameraFacing = "user" | "environment";

export function useLiveCamera(facing: LiveCameraFacing) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<LiveCameraState>("idle");

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      return;
    }

    setState("starting");
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    try {
      await waitForNextAnimationFrame();
      await waitForNextAnimationFrame();
      const video = videoRef.current;
      if (!video) {
        throw new Error("camera_video_not_ready");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
      } catch {
        // Fallback for devices/browsers without the requested facing mode (e.g. laptop webcam)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setState("ready");
    } catch {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setState("error");
    }
  }, [facing]);

  const capture = useCallback(async (fileName = "evidence.webp") => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    setState("capturing");
    const file = await capturePhotoFromVideo(video, fileName);
    setState("ready");
    return file;
  }, []);

  useEffect(
    () => () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    },
    [],
  );

  const active =
    state === "starting" || state === "ready" || state === "capturing";

  return { videoRef, state, active, start, stop, capture };
}
