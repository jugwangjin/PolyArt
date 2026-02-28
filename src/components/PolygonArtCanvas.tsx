import React, { useEffect, useRef, useState } from 'react';
import Delaunator from 'delaunator';

interface PolygonArtCanvasProps {
  imageSrc: string;
  quality: number;
  animationSpeed?: number;
}

type Point = [number, number];
type Triangle = [Point, Point, Point];

interface ColoredTriangle {
  points: Triangle;
  color: string;
  center: Point;
}

const getMedianColor = (p1: Point, p2: Point, p3: Point, data: Uint8ClampedArray, width: number, height: number) => {
  const cx = (p1[0] + p2[0] + p3[0]) / 3;
  const cy = (p1[1] + p2[1] + p3[1]) / 3;
  
  // Sample 5 points inside the triangle to find a median color
  // This prevents outlier "popping" colors
  const samples = [
    [cx, cy],
    [(2 * p1[0] + p2[0] + p3[0]) / 4, (2 * p1[1] + p2[1] + p3[1]) / 4],
    [(p1[0] + 2 * p2[0] + p3[0]) / 4, (p1[1] + 2 * p2[1] + p3[1]) / 4],
    [(p1[0] + p2[0] + 2 * p3[0]) / 4, (p1[1] + p2[1] + 2 * p3[1]) / 4],
    [cx, cy] // Double weight to centroid
  ];

  const rs = [], gs = [], bs = [];
  for (const s of samples) {
    const safeX = Math.max(0, Math.min(width - 1, Math.floor(s[0])));
    const safeY = Math.max(0, Math.min(height - 1, Math.floor(s[1])));
    const idx = (safeY * width + safeX) * 4;
    rs.push(data[idx]);
    gs.push(data[idx + 1]);
    bs.push(data[idx + 2]);
  }

  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);

  return {
    r: rs[2],
    g: gs[2],
    b: bs[2],
    cx: Math.floor(cx),
    cy: Math.floor(cy)
  };
};

const PolygonArtCanvas: React.FC<PolygonArtCanvasProps> = ({ imageSrc, quality, animationSpeed = 1.0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<string>('이미지 처리 중...');
  
  const trianglesRef = useRef<ColoredTriangle[]>([]);
  const sobelRef = useRef<Float32Array | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageSrc;
    img.onload = () => {
      imageRef.current = img;
      const maxWidth = 800;
      const maxHeight = 800; // Increased to handle vertical images better
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth * height) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight * width) / height;
        height = maxHeight;
      }

      // Floor dimensions to avoid sub-pixel issues in loops and arrays
      width = Math.floor(width);
      height = Math.floor(height);

      setDimensions({ width, height });
      processImage(img, width, height);
    };

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [imageSrc, quality, animationSpeed]);

  const processImage = (img: HTMLImageElement, width: number, height: number) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setStatus('이미지 처리 중...');
    
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const pointsMap = new Set<string>();
      const points: Point[] = [];
      
      const addPoint = (x: number, y: number) => {
        // Use higher precision for key to avoid merging points that are close but distinct
        const key = `${x.toFixed(1)},${y.toFixed(1)}`;
        if (!pointsMap.has(key)) {
          pointsMap.add(key);
          points.push([x, y]);
        }
      };

      // Add corners
      addPoint(0, 0);
      addPoint(width, 0);
      addPoint(0, height);
      addPoint(width, height);

      if (quality > 0) {
        const q = quality / 100;
        
        const step = Math.max(10, Math.floor(100 - q * 90));
        for (let i = 0; i <= width; i += step) {
          addPoint(i, 0);
          addPoint(i, height);
        }
        for (let i = 0; i <= height; i += step) {
          addPoint(0, i);
          addPoint(width, i);
        }

        setStatus('윤곽선 추출 중...');
        setTimeout(() => {
          const sobelData = new Float32Array(width * height);
          let edgeCount = 0;
          const threshold = 20 + (1 - q) * 50;

          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const getGray = (ox: number, oy: number) => {
                const idx = ((y + oy) * width + (x + ox)) * 4;
                return data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
              };

              const gx =
                -1 * getGray(-1, -1) + 1 * getGray(1, -1) +
                -2 * getGray(-1,  0) + 2 * getGray(1,  0) +
                -1 * getGray(-1,  1) + 1 * getGray(1,  1);

              const gy =
                -1 * getGray(-1, -1) + -2 * getGray(0, -1) + -1 * getGray(1, -1) +
                 1 * getGray(-1,  1) +  2 * getGray(0,  1) +  1 * getGray(1,  1);

              const grad = Math.sqrt(gx * gx + gy * gy);
              sobelData[y * width + x] = grad;
              if (grad > threshold) edgeCount++;
            }
          }
          sobelRef.current = sobelData;

          // Cap points to prevent Delaunator/Canvas from freezing
          // Scale point density by area to prevent excessive noise in smaller or vertical images
          const areaScale = Math.max(0.3, (width * height) / 480000);
          const targetEdgePoints = 12000 * q * areaScale; 
          const actualDensity = Math.min(q * 0.5, targetEdgePoints / Math.max(1, edgeCount));

          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              if (sobelData[y * width + x] > threshold && Math.random() < actualDensity) {
                addPoint(x, y);
              }
            }
          }

          // 배경과 단색 영역의 적절한 폴리곤 크기를 위해 무작위 점을 1000개 수준으로 조정합니다.
          const numRandomPoints = Math.floor(1000 * q * areaScale);
          for (let i = 0; i < numRandomPoints; i++) {
             addPoint(Math.random() * width, Math.random() * height);
          }

          pointsRef.current = points;
          runTriangulation(points, data, width, height);
        }, 50);
      } else {
        runTriangulation(points, data, width, height);
      }
    }, 50);
  };

  const runTriangulation = (points: Point[], data: Uint8ClampedArray, width: number, height: number) => {
    setStatus('삼각 분할 중...');
    setTimeout(() => {
      try {
        const delaunay = Delaunator.from(points);
        const trianglesData = delaunay.triangles;
        const coloredTriangles: ColoredTriangle[] = [];

        for (let i = 0; i < trianglesData.length; i += 3) {
          const p1 = points[trianglesData[i]];
          const p2 = points[trianglesData[i + 1]];
          const p3 = points[trianglesData[i + 2]];

          if (!p1 || !p2 || !p3) continue;

          const { r, g, b, cx, cy } = getMedianColor(p1, p2, p3, data, width, height);

          coloredTriangles.push({
            points: [p1, p2, p3],
            color: `rgb(${r},${g},${b})`,
            center: [cx, cy]
          });
        }

        // Shuffle triangles for a more organic "popping" effect instead of a swipe reveal
        for (let i = coloredTriangles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [coloredTriangles[i], coloredTriangles[j]] = [coloredTriangles[j], coloredTriangles[i]];
        }

        trianglesRef.current = coloredTriangles;
        startAnimation();
      } catch (e) {
        console.error("Triangulation failed:", e);
        setStatus('오류 발생: 이미지를 다시 업로드해주세요.');
      }
    }, 50);
  };

  const startAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const triangles = trianglesRef.current;
    const sobel = sobelRef.current;
    const points = pointsRef.current;
    const totalTriangles = triangles.length;
    const w = canvas.width;
    const h = canvas.height;
    const img = imageRef.current;

    let startTime: number | null = null;

    // Animation phases durations (ms)
    const PHASE_IMAGE = 1500 / animationSpeed;
    const PHASE_SOBEL = 2000 / animationSpeed;
    const PHASE_POINTS = 2000 / animationSpeed;
    const PHASE_LINES = 2500 / animationSpeed;
    const PHASE_COLORS = 2500 / animationSpeed;
    const PHASE_FADE_EDGES = 2000 / animationSpeed;

    const totalDuration = PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS + PHASE_LINES + PHASE_COLORS + PHASE_FADE_EDGES;

    const drawTrianglePath = (t: ColoredTriangle) => {
      ctx.beginPath();
      ctx.moveTo(t.points[0][0], t.points[0][1]);
      ctx.lineTo(t.points[1][0], t.points[1][1]);
      ctx.lineTo(t.points[2][0], t.points[2][1]);
      ctx.closePath();
    };

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      ctx.clearRect(0, 0, w, h);

      if (elapsed < PHASE_IMAGE) {
        setStatus('원본 이미지');
        if (img) ctx.drawImage(img, 0, 0, w, h);
      } 
      else if (elapsed < PHASE_IMAGE + PHASE_SOBEL) {
        setStatus('윤곽선 추출 (Sobel Filter)');
        const phaseElapsed = elapsed - PHASE_IMAGE;
        const progress = Math.min(1, phaseElapsed / PHASE_SOBEL);
        
        if (sobel) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            const imageData = tempCtx.createImageData(w, h);
            for (let i = 0; i < sobel.length; i++) {
              const val = Math.min(255, sobel[i]);
              const idx = i * 4;
              imageData.data[idx] = val;
              imageData.data[idx + 1] = val;
              imageData.data[idx + 2] = val;
              imageData.data[idx + 3] = 255;
            }
            tempCtx.putImageData(imageData, 0, 0);
            
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = progress;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.globalAlpha = 1;
          }
        }
      }
      else if (elapsed < PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS) {
        setStatus('특징점 추출');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        const phaseElapsed = elapsed - (PHASE_IMAGE + PHASE_SOBEL);
        const progress = Math.min(1, phaseElapsed / PHASE_POINTS);
        const visiblePointsCount = Math.floor(progress * points.length);

        // Draw sobel background faintly
        if (sobel) {
          ctx.globalAlpha = 0.3;
          // Re-using the logic for sobel drawing but simpler
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            const imageData = tempCtx.createImageData(w, h);
            for (let i = 0; i < sobel.length; i++) {
              const val = Math.min(255, sobel[i]);
              const idx = i * 4;
              imageData.data[idx] = val;
              imageData.data[idx + 1] = val;
              imageData.data[idx + 2] = val;
              imageData.data[idx + 3] = 255;
            }
            tempCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0);
          }
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#00ffcc';
        for (let i = 0; i < visiblePointsCount; i++) {
          ctx.beginPath();
          ctx.arc(points[i][0], points[i][1], 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (elapsed < PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS + PHASE_LINES) {
        setStatus('델로네 삼각 분할 (Delaunay Triangulation)');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        const phaseElapsed = elapsed - (PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS);
        const progress = Math.min(1, phaseElapsed / PHASE_LINES);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const visibleCount = Math.floor(easedProgress * totalTriangles);

        // Keep points visible but fading out
        ctx.fillStyle = `rgba(0, 255, 204, ${0.8 * (1 - progress)})`;
        for (let i = 0; i < points.length; i++) {
          ctx.beginPath();
          ctx.arc(points[i][0], points[i][1], 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
        ctx.lineWidth = 0.5;

        for (let i = 0; i < visibleCount; i++) {
          drawTrianglePath(triangles[i]);
          ctx.stroke();
        }
      }
      else if (elapsed < PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS + PHASE_LINES + PHASE_COLORS) {
        setStatus('색상 데이터 추출 및 채우기');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        const phaseElapsed = elapsed - (PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS + PHASE_LINES);
        const progress = Math.min(1, phaseElapsed / PHASE_COLORS);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const coloredCount = Math.floor(easedProgress * totalTriangles);

        for (let i = 0; i < totalTriangles; i++) {
          drawTrianglePath(triangles[i]);
          
          if (i < coloredCount) {
            ctx.fillStyle = triangles[i].color;
            ctx.fill();
            // Fade out the white wireframe as we fill
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - progress)})`;
          } else {
            // Keep the initial triangulation wireframe visible
            ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
          }
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      else if (elapsed < totalDuration) {
        setStatus('최종 렌더링');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const phaseElapsed = elapsed - (PHASE_IMAGE + PHASE_SOBEL + PHASE_POINTS + PHASE_LINES + PHASE_COLORS);
        const progress = Math.min(1, phaseElapsed / PHASE_FADE_EDGES);

        for (let i = 0; i < totalTriangles; i++) {
          drawTrianglePath(triangles[i]);
          ctx.fillStyle = triangles[i].color;
          ctx.fill();
          
          ctx.strokeStyle = triangles[i].color;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (progress < 1) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - progress)})`;
            ctx.stroke();
          }
        }
      }
      else {
        setStatus('완성');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        
        for (let i = 0; i < totalTriangles; i++) {
          drawTrianglePath(triangles[i]);
          ctx.fillStyle = triangles[i].color;
          ctx.fill();
          ctx.strokeStyle = triangles[i].color;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        return; // End animation
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative overflow-hidden rounded-lg bg-zinc-950 shadow-inner" style={{ width: dimensions.width || 800, height: dimensions.height || 800 }}>
        {dimensions.width === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={dimensions.width || 800}
          height={dimensions.height || 800}
          className="block"
        />
      </div>
      
      <div className="flex items-center gap-3 bg-zinc-900 px-6 py-3 rounded-full border border-zinc-800">
        <div className={`w-2 h-2 rounded-full ${status === '완성' ? 'bg-emerald-500' : 'bg-indigo-500 animate-pulse'}`}></div>
        <span className="text-sm font-mono text-zinc-300 uppercase tracking-wider">
          {status}
        </span>
      </div>
    </div>
  );
};

export default PolygonArtCanvas;
