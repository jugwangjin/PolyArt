import React, { useEffect, useRef, useState, useCallback } from 'react';
import Delaunator from 'delaunator';
import { Download } from 'lucide-react';

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
  
  // 삼각형 내부의 5개 지점을 샘플링하여 중앙값(Median) 색상을 찾습니다.
  // 이 방식은 튀는 색상(Outlier popping colors)이 선택되는 것을 방지합니다.
  const samples = [
    [cx, cy],
    [(2 * p1[0] + p2[0] + p3[0]) / 4, (2 * p1[1] + p2[1] + p3[1]) / 4],
    [(p1[0] + 2 * p2[0] + p3[0]) / 4, (p1[1] + 2 * p2[1] + p3[1]) / 4],
    [(p1[0] + p2[0] + 2 * p3[0]) / 4, (p1[1] + p2[1] + 2 * p3[1]) / 4],
    [cx, cy] // 중심점에 가중치를 두 배로 부여
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
      const maxHeight = 800; // 세로 이미지를 더 잘 처리하기 위해 높이 제한 증가
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

      // 루프 및 배열에서 서브 픽셀(sub-pixel) 문제가 발생하지 않도록 크기를 정수로 내림
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

      const q = quality / 100;

      // 1. 원본 데이터 저장 (색상 추출용)
      ctx.drawImage(img, 0, 0, width, height);
      const originalData = ctx.getImageData(0, 0, width, height).data;

      // 2. 블러 처리된 데이터 저장 (윤곽선 추출용 - 자잘한 텍스처/노이즈 제거)
      // 품질이 100%일 때는 블러를 없애 원본의 모든 디테일을 잡고, 0%일 때는 강하게 뭉갭니다.
      const blurAmount = Math.max(0, 10 - q * 10);
      ctx.filter = `blur(${blurAmount}px)`;
      ctx.drawImage(img, 0, 0, width, height);
      ctx.filter = 'none';
      const blurredData = ctx.getImageData(0, 0, width, height).data;

      const pointsMap = new Set<string>();
      const points: Point[] = [];
      
      const addPoint = (x: number, y: number) => {
        // 가깝지만 서로 다른 점들이 병합되는 것을 방지하기 위해 키의 정밀도를 높임
        const key = `${x.toFixed(1)},${y.toFixed(1)}`;
        if (!pointsMap.has(key)) {
          pointsMap.add(key);
          points.push([x, y]);
        }
      };

      // 모서리 점 추가
      addPoint(0, 0);
      addPoint(width, 0);
      addPoint(0, height);
      addPoint(width, height);

      if (quality > 0) {
        // 테두리 점 간격 (품질에 따라 10px ~ 100px)
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
          // 품질 100%에서는 미세한 그래디언트도 모두 잡도록 threshold를 대폭 낮춥니다.
          const threshold = 10 + (1 - q) * 40;

          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const getGray = (ox: number, oy: number) => {
                const idx = ((y + oy) * width + (x + ox)) * 4;
                return blurredData[idx] * 0.299 + blurredData[idx + 1] * 0.587 + blurredData[idx + 2] * 0.114;
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
            }
          }
          sobelRef.current = sobelData;

          // 3. Adaptive Grid (Quadtree) 기반 Local Maximum 알고리즘
          // 기본적으로는 일정한 격자(Grid)를 사용하지만, 눈이나 입술처럼 윤곽선(Gradient)이
          // 매우 강한(Salient) 영역은 격자를 더 잘게 쪼개어(Subdivide) 디테일을 살립니다.
          const baseCellSize = Math.max(10, Math.floor(50 - q * 40)); // 기본 격자 크기 (10px ~ 50px)
          const randomProb = 0.01 + q * 0.09; // 평탄한 영역의 무작위 점 확률
          const salientThreshold = threshold + 30 + (1 - q) * 20; // 강한 윤곽선 기준치
          const maxDepth = 2; // 최대 분할 깊이 (0: 분할 안함, 1: 4등분, 2: 16등분)

          const processCell = (cx: number, cy: number, size: number, depth: number) => {
            let maxGrad = 0;
            let maxX = -1;
            let maxY = -1;

            const endY = Math.min(cy + size, height - 1);
            const endX = Math.min(cx + size, width - 1);

            for (let y = cy; y < endY; y++) {
              for (let x = cx; x < endX; x++) {
                const grad = sobelData[y * width + x];
                if (grad > maxGrad) {
                  maxGrad = grad;
                  maxX = x;
                  maxY = y;
                }
              }
            }

            // 윤곽선이 매우 강하고, 아직 최대 분할 깊이에 도달하지 않았으며, 격자를 더 쪼갤 수 있다면
            if (maxGrad > salientThreshold && depth < maxDepth && size > 6) {
              const half = Math.floor(size / 2);
              processCell(cx, cy, half, depth + 1);
              processCell(cx + half, cy, half, depth + 1);
              processCell(cx, cy + half, half, depth + 1);
              processCell(cx + half, cy + half, half, depth + 1);
              return;
            }

            if (maxGrad > threshold) {
              // 윤곽선이 확실한 곳은 가장 강한 점 하나만 추가
              addPoint(maxX, maxY);
            } else if (depth === 0 && Math.random() < randomProb) {
              // 윤곽선이 없는 평탄한 곳은 매우 드물게 점을 추가하여 구조 유지 (최상위 격자에서만)
              const jitterX = (Math.random() - 0.5) * size;
              const jitterY = (Math.random() - 0.5) * size;
              addPoint(
                Math.max(0, Math.min(width, cx + size / 2 + jitterX)),
                Math.max(0, Math.min(height, cy + size / 2 + jitterY))
              );
            }
          };

          for (let y = 0; y < height; y += baseCellSize) {
            for (let x = 0; x < width; x += baseCellSize) {
              processCell(x, y, baseCellSize, 0);
            }
          }

          // 4. Delaunay Refinement (Too-sharp triangle splitting)
          // 뾰족하고 길쭉한 기형적인 삼각형(Sliver triangles)이나 너무 거대한 삼각형을 쪼갭니다.
          let currentPoints = [...points];
          const refinementPasses = 2; // 2번 정도 반복하여 뾰족한 삼각형을 해소합니다.

          for (let pass = 0; pass < refinementPasses; pass++) {
            const delaunay = Delaunator.from(currentPoints);
            const trianglesData = delaunay.triangles;
            let added = 0;
            
            for (let i = 0; i < trianglesData.length; i += 3) {
              const p1 = currentPoints[trianglesData[i]];
              const p2 = currentPoints[trianglesData[i + 1]];
              const p3 = currentPoints[trianglesData[i + 2]];
              
              if (!p1 || !p2 || !p3) continue;
              
              const l1 = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
              const l2 = Math.hypot(p2[0] - p3[0], p2[1] - p3[1]);
              const l3 = Math.hypot(p3[0] - p1[0], p3[1] - p1[1]);
              
              const maxL = Math.max(l1, l2, l3);
              const minL = Math.min(l1, l2, l3);
              
              const s = (l1 + l2 + l3) / 2;
              const area = Math.sqrt(Math.max(0, s * (s - l1) * (s - l2) * (s - l3)));
              
              // 가장 긴 변이 가장 짧은 변보다 4배 이상 길면 "너무 뾰족한" 삼각형으로 간주
              const isSharp = (maxL / Math.max(1, minL)) > 4;
              // 화면 전체 면적의 4%를 넘어가면 "너무 거대한" 삼각형으로 간주
              const isTooLarge = area > (width * height * 0.04);
              
              if ((isSharp && area > 50) || isTooLarge) {
                // 가장 긴 변의 중심점을 새로운 특징점으로 추가하여 삼각형을 분할합니다.
                let midX, midY;
                if (maxL === l1) {
                  midX = (p1[0] + p2[0]) / 2;
                  midY = (p1[1] + p2[1]) / 2;
                } else if (maxL === l2) {
                  midX = (p2[0] + p3[0]) / 2;
                  midY = (p2[1] + p3[1]) / 2;
                } else {
                  midX = (p3[0] + p1[0]) / 2;
                  midY = (p3[1] + p1[1]) / 2;
                }
                
                const key = `${midX.toFixed(1)},${midY.toFixed(1)}`;
                if (!pointsMap.has(key)) {
                  pointsMap.add(key);
                  currentPoints.push([midX, midY]);
                  added++;
                }
              }
            }
            if (added === 0) break;
          }

          pointsRef.current = currentPoints;
          runTriangulation(currentPoints, originalData, width, height);
        }, 50);
      } else {
        runTriangulation(points, originalData, width, height);
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

        // 스와이프 효과 대신 유기적으로 튀어나오는(Popping) 효과를 위해 삼각형 배열을 무작위로 섞음
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

    // 애니메이션 각 단계별 지속 시간 (ms)
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

        // Sobel 배경을 희미하게 그림
        if (sobel) {
          ctx.globalAlpha = 0.3;
          // Sobel 그리기 로직 재사용 (단순화됨)
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

        // 점들을 유지하되 서서히 페이드 아웃시킴
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
            // 색상이 채워짐에 따라 하얀색 와이어프레임을 페이드 아웃시킴
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - progress)})`;
          } else {
            // 초기 삼각 분할 와이어프레임을 계속 유지함
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
        return; // 애니메이션 종료
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'polyart.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

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
        {status === '완성' && (
          <button
            onClick={handleSave}
            className="ml-2 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>저장</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PolygonArtCanvas;
