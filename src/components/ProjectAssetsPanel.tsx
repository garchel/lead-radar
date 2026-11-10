import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Loader2,
  Palette,
  RefreshCw,
} from 'lucide-react';
import { BrandSnapshot, ProjectAssetFile, ProjectAssets } from '../types';

interface ProjectAssetsPanelProps {
  projectId: string;
  /** Muda quando o projeto é salvo (ex.: sitePath novo) para recarregar a lista. */
  refreshKey?: string | number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function isExternal(url?: string): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

const BrandThumb: React.FC<{ url: string; alt: string; className?: string }> = ({ url, alt, className }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-500 ${className || ''}`}>
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover bg-slate-100 ${className || ''}`}
    />
  );
};

const FilePreview: React.FC<{ file: ProjectAssetFile }> = ({ file }) => {
  if (file.type === 'image') {
    return <BrandThumb url={file.url} alt={file.name} className="w-full h-24 rounded-lg" />;
  }
  if (file.type === 'video') {
    return (
      <div className="relative w-full h-24 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
        <video src={file.url} muted preload="metadata" className="w-full h-full object-cover opacity-80" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow">
            <Film className="w-4 h-4 text-slate-700" />
          </span>
        </span>
      </div>
    );
  }
  if (file.type === 'document') {
    return (
      <div className="w-full h-24 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
        <FileText className="w-5 h-5" />
      </div>
    );
  }
  return (
    <div className="w-full h-24 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
      <FolderOpen className="w-5 h-5" />
    </div>
  );
};

const BrandSection: React.FC<{ brand?: BrandSnapshot }> = ({ brand }) => {
  if (!brand) {
    return (
      <p className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
        Nenhuma identidade visual pesquisada ainda. Abra o lead e use{' '}
        <strong>Pesquisar identidade</strong> para captar paleta, logo e referências.
      </p>
    );
  }

  const hasAnyReference = brand.palette.length > 0 || Boolean(brand.logo) || brand.imagery.length > 0;

  return (
    <div className="space-y-3">
      {brand.palette.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {brand.palette.map((color, index) => (
            <span
              key={`${color.hex}-${index}`}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1"
              title={[color.name, color.role].filter(Boolean).join(' • ') || color.hex}
            >
              <span
                className="w-4 h-4 rounded border border-slate-300 shrink-0"
                style={{ backgroundColor: color.hex }}
              />
              <span className="text-[11px] font-mono font-semibold text-slate-600">{color.hex}</span>
            </span>
          ))}
        </div>
      )}

      {brand.logo && (
        <div className="flex items-start gap-2.5 bg-white border border-slate-200 rounded-lg p-2.5">
          {brand.logo.url ? (
            <BrandThumb url={brand.logo.url} alt="Logo identificado" className="w-14 h-14 rounded-md border border-slate-200 shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Logo</span>
            <p className="text-[11px] text-slate-700 leading-snug">
              {brand.logo.description || 'Logo identificado nas imagens públicas.'}
            </p>
            {typeof brand.logo.confidence === 'number' && (
              <p className="text-[11px] text-slate-500">
                Confiança {Math.round(brand.logo.confidence * 100)}%
                {brand.logo.url && (
                  <>
                    {' • '}
                    <a
                      href={brand.logo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      abrir imagem
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {brand.imagery.length > 0 && (
        <div>
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Referências visuais
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {brand.imagery.map((item, index) => (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-indigo-300 transition-colors"
                title={item.description || 'Referência visual'}
              >
                <BrandThumb url={item.url} alt={item.description || 'Referência visual'} className="w-full h-20" />
                <span className="block px-2 py-1.5 text-[11px] text-slate-600 line-clamp-2 leading-snug">
                  {item.description || 'Referência visual'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {!hasAnyReference && (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
          {brand.summary}
        </p>
      )}

      {(brand.profiles.instagram || brand.profiles.facebook) && (
        <div className="flex flex-wrap gap-3 text-[11px]">
          {brand.profiles.instagram && (
            <a
              href={brand.profiles.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-pink-600 hover:underline font-semibold"
            >
              <ExternalLink className="w-3 h-3" /> Instagram
            </a>
          )}
          {brand.profiles.facebook && (
            <a
              href={brand.profiles.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
            >
              <ExternalLink className="w-3 h-3" /> Facebook
            </a>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Painel de assets do projeto: mostra o que foi identificado na pesquisa de
 * marca (logo/paleta/referências) e os arquivos já adicionados à pasta da LP.
 */
export const ProjectAssetsPanel: React.FC<ProjectAssetsPanelProps> = ({ projectId, refreshKey }) => {
  const [data, setData] = useState<ProjectAssets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/assets`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || `Falha ao carregar assets (HTTP ${response.status}).`);
      }
      setData(payload as ProjectAssets);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar os assets do projeto.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const counts = useMemo(() => {
    const files = data?.files || [];
    const identified =
      (data?.brand?.palette.length || 0) +
      (data?.brand?.logo ? 1 : 0) +
      (data?.brand?.imagery.length || 0);
    return { identified, files: files.length };
  }, [data]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          title={expanded ? 'Recolher assets' : 'Expandir assets'}
        >
          <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shrink-0">
            <Images className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Assets do projeto
            </span>
            <span className="block text-[11px] text-slate-500 truncate">
              {data?.sitePath || 'pasta da LP ainda não definida'}
            </span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 ml-1">
            <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-[11px] font-bold">
              <Palette className="w-3 h-3" /> {counts.identified} identificado(s)
            </span>
            <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-[11px] font-bold">
              <FolderOpen className="w-3 h-3" /> {counts.files} arquivo(s)
            </span>
          </span>
        </button>
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={load}
            className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-white transition-colors"
            title="Recarregar assets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 rounded-md text-slate-500 hover:text-slate-600 hover:bg-white transition-colors"
            title={expanded ? 'Recolher assets' : 'Expandir assets'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
            />
          </button>
        </span>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-4 border-t border-slate-200 pt-3">
          {loading && !data && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando assets...
            </p>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}

          {data && (
            <>
              <div>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <Palette className="w-3.5 h-3.5" /> Identificados na pesquisa de marca
                </span>
                <BrandSection brand={data.brand} />
              </div>

              <div>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <FolderOpen className="w-3.5 h-3.5" /> Adicionados à pasta da LP
                </span>
                {!data.siteExists ? (
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                    {data.sitePath
                      ? `A pasta \`${data.sitePath}\` ainda não existe no disco. Ela é criada quando o agente implementa a página.`
                      : 'Defina a pasta da LP (nicho/slug) na etapa de desenvolvimento para listar os arquivos.'}
                  </p>
                ) : data.files.length === 0 ? (
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                    A pasta existe, mas ainda não há imagens, vídeos ou documentos nela.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {data.files.map((file) => (
                      <a
                        key={file.path}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-300 hover:shadow-sm transition-all"
                        title={`${file.path} • ${formatBytes(file.size)}`}
                      >
                        <FilePreview file={file} />
                        <span className="block px-2 py-1.5">
                          <span className="block text-[11px] font-semibold text-slate-700 truncate">{file.name}</span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {file.path} • {formatBytes(file.size)}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {(isExternal(data.links.previewUrl) ||
                isExternal(data.links.deployUrl) ||
                isExternal(data.links.wireframeUrl) ||
                isExternal(data.links.githubRepoUrl)) && (
                <div className="flex flex-wrap gap-3 text-[11px] pt-1 border-t border-slate-200">
                  {isExternal(data.links.wireframeUrl) && (
                    <a
                      href={data.links.wireframeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-orange-700 hover:underline font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" /> Wireframe
                    </a>
                  )}
                  {isExternal(data.links.previewUrl) && (
                    <a
                      href={data.links.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" /> Preview
                    </a>
                  )}
                  {isExternal(data.links.deployUrl) && (
                    <a
                      href={data.links.deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" /> Deploy
                    </a>
                  )}
                  {isExternal(data.links.githubRepoUrl) && (
                    <a
                      href={data.links.githubRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-600 hover:underline font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" /> Repositório
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
