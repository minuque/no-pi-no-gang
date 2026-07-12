"use client";

import { useCallback, useState } from "react";

import type { AttachedImage } from "./chat-input-support";

export function useAttachedImages() {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const newImages = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<AttachedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve({
                data: result.split(",")[1],
                mimeType: file.type,
                previewUrl: URL.createObjectURL(file),
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    );
    setAttachedImages((current) => [...current, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((current) => {
      const next = [...current];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
  }, []);

  return { attachedImages, clearImages, processImageFiles, removeImage };
}
