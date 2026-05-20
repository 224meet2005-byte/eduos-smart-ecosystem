import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text } from 'react-konva';

type PageData = {
  id: string;
  objects: any[]; // Konva serializable objects
};

type Props = {
  pages?: PageData[];
  onChange?: (pages: PageData[]) => void;
};

function uid() { return Math.random().toString(36).slice(2,9); }

export default function CanvasEditor({ pages: initialPages = [], onChange }: Props) {
  const [pages, setPages] = useState<PageData[]>(() => initialPages.length ? initialPages : [{ id: uid(), objects: [] }]);
  const [activeTool, setActiveTool] = useState<'pen'|'eraser'|'text'|'select'>('pen');
  const [toolSize, setToolSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#111827');
  const [eraserSize, setEraserSize] = useState(16);
  const [isDrawing, setIsDrawing] = useState(false);

  const stageRefs = useRef<Record<string, any>>({});
  const isDrawingRef = useRef(false);

  useEffect(() => { onChange?.(pages); }, [pages]);

  useEffect(() => {
    // update cursor for every stage container
    Object.values(stageRefs.current).forEach((stage: any) => {
      if (!stage || !stage.container) return;
      const c = stage.container();
      if (!c) return;
      if (activeTool === 'pen') c.style.cursor = 'crosshair';
      else if (activeTool === 'eraser') c.style.cursor = 'crosshair';
      else if (activeTool === 'text') c.style.cursor = 'text';
      else c.style.cursor = 'default';
    });
  }, [activeTool, isDrawing, pages]);

  useEffect(() => {
    // cleanup editor overlay on unmount
    return () => {
      removeEditor();
    };
  }, []);

  const addPage = () => setPages(p => [...p, { id: uid(), objects: [] }]);
  const deletePage = (id: string) => setPages(p => p.filter(x => x.id !== id));
  const exportPages = () => pages.map(pg => ({ id: pg.id, json: pg.objects }));

  const pgIndexById = (id: string) => pages.findIndex(p => p.id === id);

  // Text editing overlay helpers
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editingInfoRef = useRef<{ pageId: string; objIndex: number } | null>(null);

  const removeEditor = () => {
    const ta = editingTextareaRef.current;
    if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
    editingTextareaRef.current = null;
    editingInfoRef.current = null;
  };

  const showTextEditor = (pageId: string, pageIndex: number, objIndex: number, textObj: any, stage: any, pointerPos: any) => {
    removeEditor();
    const container = stage.container();
    const rect = container.getBoundingClientRect();

    const textarea = document.createElement('textarea');
    textarea.value = textObj.text || '';
    textarea.style.position = 'absolute';
    textarea.style.top = `${rect.top + pointerPos.y}px`;
    textarea.style.left = `${rect.left + pointerPos.x}px`;
    textarea.style.font = `${textObj.fontSize || 20}px sans-serif`;
    textarea.style.padding = '4px';
    textarea.style.border = '1px solid #ccc';
    textarea.style.background = 'transparent';
    textarea.style.color = textObj.fill || '#000';
    textarea.style.outline = 'none';
    textarea.rows = 3;
    document.body.appendChild(textarea);
    textarea.focus();
    editingTextareaRef.current = textarea;
    editingInfoRef.current = { pageId, objIndex };

    const commit = () => {
      const info = editingInfoRef.current;
      if (!info) return removeEditor();
      const val = textarea.value;
      setPages(prev => prev.map(pg => {
        if (pg.id !== info.pageId) return pg;
        const objs = [...pg.objects];
        const idx = info.objIndex;
        const obj = { ...objs[idx], text: val };
        objs[idx] = obj;
        return { ...pg, objects: objs };
      }));
      removeEditor();
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { removeEditor(); }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { commit(); }
    });
  };

  const handleMouseDown = (pageId: string, e: any) => {
    const stage = stageRefs.current[pageId];
    const pos = stage?.getPointerPosition?.();
    if (!pos) return;

    // PEN
    if (activeTool === 'pen') {
      setIsDrawing(true);
      isDrawingRef.current = true;
      const newLine = { tool: 'pen', points: [pos.x, pos.y], stroke: brushColor, strokeWidth: toolSize, tension: 0.5, lineCap: 'round', lineJoin: 'round' };
      setPages(prev => prev.map(pg => pg.id === pageId ? { ...pg, objects: [...pg.objects, newLine] } : pg));
      return;
    }

    // ERASER (composite erase)
    if (activeTool === 'eraser') {
      setIsDrawing(true);
      isDrawingRef.current = true;
      const newLine = { tool: 'eraser', points: [pos.x, pos.y], strokeWidth: eraserSize, lineCap: 'round', lineJoin: 'round', globalCompositeOperation: 'destination-out' };
      setPages(prev => prev.map(pg => pg.id === pageId ? { ...pg, objects: [...pg.objects, newLine] } : pg));
      return;
    }

    // TEXT: create object & open editor immediately
    if (activeTool === 'text') {
      const textObj = { tool: 'text', text: '', x: pos.x, y: pos.y, fontSize: 20, fill: '#000', draggable: true };
      setPages(prev => prev.map(pg => pg.id === pageId ? { ...pg, objects: [...pg.objects, textObj] } : pg));
      // use page index and last obj index
      const pageIndex = pgIndexById(pageId);
      const objIndex = pages[pageIndex] ? pages[pageIndex].objects.length : 0;
      // open editor on next frame
      requestAnimationFrame(() => {
        const stageNow = stageRefs.current[pageId];
        if (!stageNow) return;
        showTextEditor(pageId, pageIndex, objIndex, textObj, stageNow, pos);
      });
      return;
    }

    // select mode does nothing special on down
  };

  const handleMouseMove = (pageId: string, e: any) => {
    // do not draw unless actively drawing (mouse down / touch active)
    if (!isDrawingRef.current && !isDrawing) return;
    const stage = stageRefs.current[pageId];
    const pos = stage?.getPointerPosition?.();
    if (!pos) return;

    setPages(prev => prev.map(pg => {
      if (pg.id !== pageId) return pg;
      const objs = [...pg.objects];
      const last = objs[objs.length-1];
      if (!last) return pg;
      if (last.tool === 'pen' || last.tool === 'eraser') {
        last.points = [...last.points, pos.x, pos.y];
        objs[objs.length-1] = last;
        return { ...pg, objects: objs };
      }
      return pg;
    }));
  };

  const handleMouseUp = (pageId: string, e: any) => {
    setIsDrawing(false);
    isDrawingRef.current = false;
  };

  const handleMouseLeave = (pageId: string, e: any) => {
    setIsDrawing(false);
    isDrawingRef.current = false;
  };

  // double click on text to edit
  const handleTextDblClick = (pageId: string, objIndex: number, o: any, evt: any) => {
    const stage = stageRefs.current[pageId];
    const pos = stage?.getPointerPosition?.();
    if (!pos) return;
    const pageIndex = pgIndexById(pageId);
    showTextEditor(pageId, pageIndex, objIndex, o, stage, pos);
  };

  return (
    <div className="canvas-editor">
      <div className="flex gap-2 p-2 bg-white glass">
        <button onClick={() => setActiveTool('pen')} className={`btn ${activeTool === 'pen' ? 'active' : ''}`}>Pen</button>
        <button onClick={() => setActiveTool('eraser')} className={`btn ${activeTool === 'eraser' ? 'active' : ''}`}>Eraser</button>
        <button onClick={() => setActiveTool('text')} className={`btn ${activeTool === 'text' ? 'active' : ''}`}>Text</button>
        <button onClick={() => setActiveTool('select')} className={`btn ${activeTool === 'select' ? 'active' : ''}`}>Select</button>
        <button onClick={addPage} className="btn">Add Page</button>
      </div>

      <div className="pages space-y-6 p-4">
        {pages.map((pg) => (
          <div key={pg.id} className="notebook-page relative bg-white rounded-lg shadow-md mx-auto my-6 p-6" style={{ width: '210mm', minHeight: '297mm' }}>
            <Stage
              width={800}
              height={1120}
              onMouseDown={(e) => handleMouseDown(pg.id, e)}
              onMouseMove={(e) => handleMouseMove(pg.id, e)}
              onMouseUp={(e) => handleMouseUp(pg.id, e)}
              onMouseLeave={(e) => handleMouseLeave(pg.id, e)}
              onTouchStart={(e) => { e.evt?.preventDefault?.(); handleMouseDown(pg.id, e); }}
              onTouchMove={(e) => { e.evt?.preventDefault?.(); handleMouseMove(pg.id, e); }}
              onTouchEnd={(e) => { e.evt?.preventDefault?.(); handleMouseUp(pg.id, e); }}
              ref={node => stageRefs.current[pg.id] = node}
            >
              <Layer>
                {/* ruled lines */}
                {[...Array(40)].map((_, i) => (
                  <Line key={i} points={[0, 20 + i*28, 800, 20 + i*28]} stroke="#e6f0ff" strokeWidth={1} />
                ))}
                <Line points={[48, 0, 48, 1120]} stroke="#ff6b6b" strokeWidth={2} />

                {pg.objects.map((o, i) => {
                  if (o.tool === 'pen') {
                    return <Line key={i}
                      points={o.points}
                      stroke={o.stroke}
                      strokeWidth={o.strokeWidth}
                      tension={o.tension ?? 0.5}
                      lineCap={o.lineCap ?? 'round'}
                      lineJoin={o.lineJoin ?? 'round'}
                    />;
                  }
                  if (o.tool === 'eraser') {
                    // use composite operation so erased pixels are removed
                    return <Line key={i}
                      points={o.points}
                      stroke={'#000'}
                      strokeWidth={o.strokeWidth}
                      lineCap={o.lineCap ?? 'round'}
                      lineJoin={o.lineJoin ?? 'round'}
                      globalCompositeOperation={o.globalCompositeOperation ?? 'destination-out'}
                    />;
                  }
                  if (o.tool === 'text') {
                    return <Text key={i}
                      text={o.text || ''}
                      x={o.x}
                      y={o.y}
                      fontSize={o.fontSize ?? 20}
                      fill={o.fill ?? '#000'}
                      draggable={!!o.draggable}
                      onDblClick={(evt) => handleTextDblClick(pg.id, i, o, evt)}
                    />;
                  }
                  return null;
                })}
              </Layer>
            </Stage>
          </div>
        ))}
      </div>
    </div>
  );
}