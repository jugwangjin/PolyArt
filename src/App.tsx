import React, { useState } from 'react';
import { Upload, Image as ImageIcon, Settings2, Github, Instagram } from 'lucide-react';
import PolygonArtCanvas from './components/PolygonArtCanvas';

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [quality, setQuality] = useState<number>(50);
  const [committedQuality, setCommittedQuality] = useState<number>(50);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center py-12 px-4 font-sans">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
            폴리곤 아트 만들기
          </h1>
          <div className="flex items-center justify-center gap-6 text-sm text-zinc-400 pt-2">
            <a 
              href="https://github.com/jugwangjin/PolyArt" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 hover:text-white transition-colors"
            >
              <Github className="w-5 h-5" />
              <span>GitHub</span>
            </a>
            <a 
              href="https://instagram.com/panggun_ju" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 hover:text-white transition-colors"
            >
              <Instagram className="w-5 h-5" />
              <span>@panggun_ju</span>
            </a>
          </div>
        </div>

        {!imageSrc ? (
          <div className="w-full max-w-xl mx-auto">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-zinc-800 border-dashed rounded-2xl cursor-pointer bg-zinc-900/50 hover:bg-zinc-900 transition-colors group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <div className="p-4 bg-zinc-800 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
                </div>
                <p className="mb-2 text-sm text-zinc-400">
                  <span className="font-semibold text-zinc-200">클릭하여 업로드</span>하거나 이미지를 드래그 앤 드롭하세요
                </p>
                <p className="text-xs text-zinc-500">PNG, JPG 또는 WEBP (최대 5MB)</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <label className="text-sm text-zinc-400 flex items-center gap-2 whitespace-nowrap">
                  <Settings2 className="w-4 h-4" />
                  복원 품질: {quality}%
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  onMouseUp={() => setCommittedQuality(quality)}
                  onTouchEnd={() => setCommittedQuality(quality)}
                  className="w-full sm:w-48 accent-white"
                />
              </div>
              <button
                onClick={() => setImageSrc(null)}
                className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <ImageIcon className="w-4 h-4" />
                다른 이미지 업로드
              </button>
            </div>
            <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 shadow-2xl">
              <PolygonArtCanvas imageSrc={imageSrc} quality={committedQuality} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
