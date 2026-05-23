import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
import { uploadPhoto, deletePhoto } from "../../lib/storage.js";
import { useApp } from "../../store/index.js";
import { SectionTitle, EmptyState } from "../../components/ui.jsx";

export default function PhotoGallery({ loan, userId }) {
  const { dispatch } = useApp();
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef(null);

  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const newPhotos = await Promise.all(
        Array.from(files).map((file) => uploadPhoto(userId, loan.id, file))
      );
      dispatch({
        type: "UPDATE_LOAN",
        payload: { id: loan.id, photos: [...(loan.photos || []), ...newPhotos] },
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo) => {
    await deletePhoto(photo);
    dispatch({
      type: "UPDATE_LOAN",
      payload: { id: loan.id, photos: (loan.photos || []).filter((p) => p.id !== photo.id) },
    });
  };

  return (
    <>
      <div>
        <SectionTitle action={
          <button onClick={() => photoInputRef.current?.click()}
            className="text-[11px] font-medium uppercase tracking-wider text-amber-500 hover:text-amber-400">
            {uploading ? "Subiendo..." : "+ Agregar"}
          </button>
        }>
          Fotos adjuntas
        </SectionTitle>
        <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        {loan.photos?.length ? (
          <div className="grid grid-cols-3 gap-2">
            {loan.photos.map((photo) => (
              <div key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800/70">
                <img src={photo.url || photo.data} alt={photo.name}
                  className="h-full w-full cursor-pointer object-cover transition-transform group-hover:scale-105"
                  onClick={() => setLightboxPhoto(photo)} />
                <button onClick={() => removePhoto(photo)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState Icon={Camera} title="Sin fotos adjuntas"
            hint="Comprobantes, garantías o documentación del préstamo." />
        )}
      </div>

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 p-4"
          onClick={() => setLightboxPhoto(null)}>
          <img src={lightboxPhoto.url || lightboxPhoto.data} alt={lightboxPhoto.name}
            className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxPhoto(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
