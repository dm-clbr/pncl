import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import Sheet from "@/components/portal/Sheet";
import "@/styles/portal-photo-crop.css";
import {
  getCroppedProfilePhotoBlob,
  profilePhotoBlobToFile,
} from "@/lib/profile-photo";
import { toast } from "sonner";

interface ProfilePhotoCropModalProps {
  imageSrc: string;
  onClose: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
}

export default function ProfilePhotoCropModal({
  imageSrc,
  onClose,
  onConfirm,
}: ProfilePhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;

    setProcessing(true);
    try {
      const blob = await getCroppedProfilePhotoBlob(imageSrc, croppedAreaPixels);
      const file = profilePhotoBlobToFile(blob);
      const previewUrl = URL.createObjectURL(blob);
      onConfirm(file, previewUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to process photo.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Sheet open title="Crop profile photo" onClose={onClose}>
      <div className="portal-photo-crop-body">
        <p className="portal-photo-crop-note">Drag to reposition. Your photo is compressed to 300 KB before upload.</p>
        <div className="portal-photo-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <label className="portal-photo-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>

        <div className="portal-photo-crop-actions">
          <button type="button" className="portal-photo-crop-action" onClick={onClose} disabled={processing}>
            Cancel
          </button>
          <button
            type="button"
            className="portal-photo-crop-action is-primary"
            onClick={() => void handleConfirm()}
            disabled={processing || !croppedAreaPixels}
          >
            {processing ? "Processing..." : "Use photo"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
