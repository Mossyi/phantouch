import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, FileCheck, PenTool, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { PRESET_PERSONAS } from '../../core/ai/personaPrompts';
import {
  CERTIFICATE_CLAUSES,
  CERTIFICATE_REVIEWS,
  CERTIFICATE_STORAGE_KEY,
  CERTIFICATE_TERMS,
  CERTIFICATE_THEMES,
  CertificateReviewId,
  CertificateTermId,
  CertificateThemeId,
  createSignedCertificateRecord,
  normalizeSignedCertificateRecord,
  SignedCertificateRecord,
} from '../../core/discipline/certificate';
import { TTSManager } from '../../core/voice/ttsManager';

const loadCertificate = (): SignedCertificateRecord | null => {
  try {
    return normalizeSignedCertificateRecord(JSON.parse(localStorage.getItem(CERTIFICATE_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
};

const safeFilename = (record: SignedCertificateRecord): string => (
  `幻触契约-${record.participantName}-${record.id}.pdf`.replace(/[\\/:*?"<>|]/g, '_')
);

export const CertificateTab: React.FC = () => {
  const [participantName, setParticipantName] = useState('见习练习生');
  const [mentorId, setMentorId] = useState('dark_femboy');
  const [themeId, setThemeId] = useState<CertificateThemeId>('transformation');
  const [termId, setTermId] = useState<CertificateTermId>('90d');
  const [reviewId, setReviewId] = useState<CertificateReviewId>('30d');
  const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>(CERTIFICATE_CLAUSES.map((clause) => clause.id));
  const [customPromise, setCustomPromise] = useState('');
  const [isSigned, setIsSigned] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [signedRecord, setSignedRecord] = useState<SignedCertificateRecord | null>(loadCertificate);
  const [exportStatus, setExportStatus] = useState('');
  const [exportAfterSign, setExportAfterSign] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const certificateRef = useRef<HTMLElement | null>(null);
  const drawingRef = useRef(false);

  const selectedMentor = PRESET_PERSONAS.find((persona) => persona.id === mentorId) || PRESET_PERSONAS[0];

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setIsSigned(false);
    setConsentConfirmed(false);
  };

  const canvasPoint = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const beginSignature = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const point = canvasPoint(clientX, clientY, canvas);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    setConsentConfirmed(false);
  };

  const continueSignature = (clientX: number, clientY: number) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const point = canvasPoint(clientX, clientY, canvas);
    context.strokeStyle = '#d94d7f';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineTo(point.x, point.y);
    context.stroke();
    setIsSigned(true);
  };

  const endSignature = () => {
    drawingRef.current = false;
  };

  const exportPdf = async (record: SignedCertificateRecord) => {
    const element = certificateRef.current;
    if (!element || isExporting) return;
    setIsExporting(true);
    setExportStatus('正在生成高清 PDF…');
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', (pageWidth - canvas.width * scale) / 2, margin, canvas.width * scale, canvas.height * scale, undefined, 'FAST');
      const filename = safeFilename(record);

      if (Capacitor.isNativePlatform()) {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
        const data = pdf.output('datauristring').split(',')[1];
        const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents, recursive: true });
        setExportStatus(`PDF 已生成：${filename}`);
        await Share.share({ title: '幻触终身契约证书', text: `契约编号 ${record.id}`, url: result.uri, dialogTitle: '保存或分享契约 PDF' });
      } else {
        pdf.save(filename);
        setExportStatus(`PDF 已下载：${filename}`);
      }
    } catch (error) {
      setExportStatus(`PDF 生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const signAndExport = () => {
    const normalizedName = participantName.trim().slice(0, 60);
    if (!normalizedName) {
      setExportStatus('请先填写参与者称呼。');
      return;
    }
    if (!isSigned || !canvasRef.current) {
      setExportStatus('请先在签名板完成签名。');
      return;
    }
    if (!consentConfirmed) {
      setExportStatus('请确认本契约自愿、可撤销且不会自动授权硬件。');
      return;
    }
    const record = createSignedCertificateRecord({
      participantName: normalizedName,
      mentorId: selectedMentor.id,
      mentorName: selectedMentor.name,
      themeId,
      termId,
      reviewId,
      clauseIds: selectedClauseIds,
      customPromise,
      signatureDataUrl: canvasRef.current.toDataURL('image/png'),
    });
    setParticipantName(normalizedName);
    setSignedRecord(record);
    setExportStatus('契约已签署并保存到本设备，正在准备 PDF…');
    setExportAfterSign(true);
    try { localStorage.setItem(CERTIFICATE_STORAGE_KEY, JSON.stringify(record)); } catch {}
    void TTSManager.getInstance().speak(`契约签署完成。${normalizedName}与导师${selectedMentor.name}已建立一份可随时撤销的本地纪念契约。`);
  };

  const startNewDraft = () => {
    if (!window.confirm('重新拟定会清除当前设备上保存的已签契约，是否继续？')) return;
    try { localStorage.removeItem(CERTIFICATE_STORAGE_KEY); } catch {}
    setSignedRecord(null);
    setExportStatus('');
    setConsentConfirmed(false);
    window.setTimeout(clearSignature, 0);
  };

  useEffect(() => {
    if (!signedRecord || !exportAfterSign) return;
    setExportAfterSign(false);
    const timer = window.setTimeout(() => void exportPdf(signedRecord), 120);
    return () => window.clearTimeout(timer);
  }, [signedRecord, exportAfterSign]);

  const certificateDocument = signedRecord && (
    <section ref={certificateRef} className="rounded-[28px] border-2 border-[#d8ae62] bg-white p-5 text-[#263247] shadow-xl">
      <header className="border-b border-[#ead9b8] pb-4 text-center">
        <p className="text-[10px] font-black tracking-[0.24em] text-[#b78028]">YCY TRANSFORMATION COVENANT</p>
        <h2 className="mt-2 text-lg font-black text-[#6f4517]">长期蜕变与陪伴纪念契约</h2>
        <p className="mt-1 font-mono text-[9px] text-[#7d8794]">契约编号：{signedRecord.id}</p>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-xl bg-[#fff8ee] p-2.5"><span className="block text-[#8b6b3e]">参与者</span><b className="mt-1 block text-[#263247]">{signedRecord.participantName}</b></div>
        <div className="rounded-xl bg-[#fff8ee] p-2.5"><span className="block text-[#8b6b3e]">陪伴导师</span><b className="mt-1 block text-[#263247]">{signedRecord.mentorName}</b></div>
        <div className="rounded-xl bg-[#fff8ee] p-2.5"><span className="block text-[#8b6b3e]">契约主题</span><b className="mt-1 block text-[#263247]">{signedRecord.themeTitle}</b></div>
        <div className="rounded-xl bg-[#fff8ee] p-2.5"><span className="block text-[#8b6b3e]">期限与复盘</span><b className="mt-1 block text-[#263247]">{signedRecord.termTitle} · {signedRecord.reviewTitle}</b></div>
      </div>
      <div className="mt-4">
        <h3 className="text-[11px] font-black text-[#6f4517]">共同约定</h3>
        <ol className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-[#455468]">
          {signedRecord.clauses.map((clause, index) => <li key={`${index}-${clause}`}>{index + 1}. {clause}</li>)}
        </ol>
      </div>
      {signedRecord.customPromise && <div className="mt-4 rounded-xl border border-[#ead9b8] bg-[#fffdf8] p-3"><p className="text-[9px] font-black text-[#8b6b3e]">自定义约定</p><p className="mt-1 whitespace-pre-wrap text-[9px] leading-relaxed text-[#455468]">{signedRecord.customPromise}</p></div>}
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-[#ead9b8] pt-4">
        <div><p className="text-[8px] text-[#7d8794]">签署时间</p><p className="mt-1 text-[9px] font-bold">{new Date(signedRecord.signedAt).toLocaleString('zh-CN')}</p><p className="mt-2 text-[8px] text-[#7d8794]">本证书为自愿剧情纪念，不构成现实法律关系。</p></div>
        <div className="w-32 text-center"><img src={signedRecord.signatureDataUrl} alt="参与者签名" className="h-14 w-full object-contain" /><p className="border-t border-[#7d8794] pt-1 text-[8px]">参与者电子签名</p></div>
      </div>
    </section>
  );

  if (signedRecord) {
    return <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><div className="flex items-center gap-2"><FileCheck className="h-5 w-5 text-emerald-600" /><div><p className="text-xs font-black text-[#263247]">契约已完成签署</p><p className="mt-0.5 text-[9px] text-slate-500">记录已保存在本设备，可随时重新生成 PDF。</p></div></div></div>
      {certificateDocument}
      {exportStatus && <p className="rounded-xl bg-pink-50 px-3 py-2 text-[10px] font-bold text-pink-700">{exportStatus}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={startNewDraft} className="flex items-center justify-center gap-1 rounded-xl bg-[#eef1f5] py-2.5 text-[10px] font-black text-[#475569]"><RotateCcw className="h-3.5 w-3.5" />重新拟定</button><button type="button" disabled={isExporting} onClick={() => void exportPdf(signedRecord)} className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 py-2.5 text-[10px] font-black text-white disabled:opacity-50"><Download className="h-3.5 w-3.5" />{isExporting ? '生成中…' : '下载 PDF'}</button></div>
    </div>;
  }

  return <div className="space-y-4">
    <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-white via-amber-50/70 to-pink-50 p-4 shadow-xl">
      <div className="text-center"><span className="text-3xl">📜</span><h2 className="mt-1 text-sm font-black text-[#6f4517]">终身契约 · 自愿纪念版</h2><p className="mt-1 text-[10px] leading-relaxed text-[#7d6040]">选择想长期保留的成长主题与约定。所有条款都可复盘、修改和撤销。</p></div>
    </section>

    <section className="space-y-4 rounded-3xl border border-pink-100 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-[#475569]">参与者称呼<input value={participantName} onChange={(event) => setParticipantName(event.target.value.slice(0, 60))} maxLength={60} className="mt-1 w-full p-2 text-xs" /></label><label className="text-[10px] font-bold text-[#475569]">陪伴导师<select value={mentorId} onChange={(event) => setMentorId(event.target.value)} className="mt-1 w-full p-2 text-xs">{PRESET_PERSONAS.map((persona) => <option key={persona.id} value={persona.id}>{persona.avatar} {persona.name}</option>)}</select></label></div>

      <div><p className="text-[10px] font-black tracking-[0.14em] text-pink-500">契约主题</p><div className="mt-2 grid grid-cols-2 gap-2">{CERTIFICATE_THEMES.map((theme) => <button type="button" key={theme.id} onClick={() => setThemeId(theme.id)} className={`rounded-2xl border p-3 text-left ${themeId === theme.id ? 'border-pink-400 bg-pink-50' : 'border-[#e4e8ee] bg-white'}`}><span className="text-[11px] font-black text-[#263247]">{theme.title}</span><span className="mt-1 block text-[9px] leading-relaxed text-slate-500">{theme.description}</span></button>)}</div></div>

      <div><p className="text-[10px] font-black tracking-[0.14em] text-pink-500">期限与复盘</p><div className="mt-2 grid grid-cols-4 gap-1.5">{CERTIFICATE_TERMS.map((term) => <button type="button" key={term.id} onClick={() => setTermId(term.id)} className={`rounded-xl px-1 py-2 text-center ${termId === term.id ? 'bg-[#263247] text-white' : 'bg-[#f2f4f7] text-[#475569]'}`}><span className="block text-[9px] font-black">{term.title}</span><span className="mt-0.5 block text-[8px] opacity-70">{term.description}</span></button>)}</div><div className="mt-2 grid grid-cols-3 gap-1.5">{CERTIFICATE_REVIEWS.map((review) => <button type="button" key={review.id} onClick={() => setReviewId(review.id)} className={`rounded-xl border px-2 py-2 text-center ${reviewId === review.id ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-[#e4e8ee] text-[#475569]'}`}><span className="block text-[9px] font-black">{review.title}</span><span className="mt-0.5 block text-[8px] opacity-70">{review.description}</span></button>)}</div></div>

      <div><div className="flex items-center justify-between"><p className="text-[10px] font-black tracking-[0.14em] text-pink-500">共同约定</p><span className="text-[8px] text-slate-400">带盾牌的安全条款不可取消</span></div><div className="mt-2 space-y-2">{CERTIFICATE_CLAUSES.map((clause) => { const checked = clause.required || selectedClauseIds.includes(clause.id); return <label key={clause.id} className={`flex items-start gap-2 rounded-xl border p-2.5 text-[9px] leading-relaxed ${checked ? 'border-pink-100 bg-pink-50/60 text-[#455468]' : 'border-[#e4e8ee] bg-white text-slate-500'}`}><input type="checkbox" checked={checked} disabled={clause.required} onChange={(event) => setSelectedClauseIds((current) => event.target.checked ? [...current, clause.id] : current.filter((id) => id !== clause.id))} className="mt-0.5 accent-pink-500" /><span>{clause.required && <ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-600" />}{clause.text}</span></label>; })}</div></div>

      <label className="block text-[10px] font-black tracking-[0.14em] text-pink-500">自定义约定（可留空）<textarea value={customPromise} onChange={(event) => setCustomPromise(event.target.value.slice(0, 300))} maxLength={300} rows={3} placeholder="例如：每周完成一次声线练习；不舒服时优先暂停并记录原因……" className="mt-2 w-full resize-none p-3 text-xs leading-relaxed text-[#263247]" /><span className="mt-1 block text-right text-[8px] text-slate-400">{customPromise.length}/300</span></label>

      <div><div className="flex items-center justify-between"><p className="flex items-center gap-1 text-[10px] font-black text-[#475569]"><PenTool className="h-3.5 w-3.5 text-pink-500" />电子签名</p><button type="button" onClick={clearSignature} className="text-[9px] font-bold text-pink-600">清除重签</button></div><div className="relative mt-2 h-28 overflow-hidden rounded-2xl border-2 border-dashed border-pink-300 bg-[#fffafd]"><canvas ref={canvasRef} width={640} height={224} onMouseDown={(event) => beginSignature(event.clientX, event.clientY)} onMouseMove={(event) => continueSignature(event.clientX, event.clientY)} onMouseUp={endSignature} onMouseLeave={endSignature} onTouchStart={(event) => { const touch = event.touches[0]; if (touch) beginSignature(touch.clientX, touch.clientY); }} onTouchMove={(event) => { event.preventDefault(); const touch = event.touches[0]; if (touch) continueSignature(touch.clientX, touch.clientY); }} onTouchEnd={endSignature} className="h-full w-full touch-none" />{!isSigned && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-bold text-slate-400">用手指或鼠标在这里签名</div>}</div></div>

      <label className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[9px] font-bold leading-relaxed text-emerald-900"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-0.5 accent-emerald-600" />我确认这是自愿、可修改、可撤销的剧情纪念契约；签署不会自动开启或授权任何硬件。</label>
      {exportStatus && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">{exportStatus}</p>}
      <button type="button" onClick={signAndExport} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-pink-500 to-fuchsia-500 py-3.5 text-xs font-black text-white shadow-lg"><Sparkles className="h-4 w-4" />签署并生成 PDF</button>
    </section>
  </div>;
};

