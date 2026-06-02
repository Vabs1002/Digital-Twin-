import React from 'react';

interface RAGSource {
  text: string;
  source: string;
  title: string;
  score?: number;
}

interface RAGViewerProps {
  sources: RAGSource[];
}

export const RAGViewer: React.FC<RAGViewerProps> = ({ sources }) => {
  return (
    <div className="inspector-card">
      <div className="inspector-label">RAG Grounding Logs</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
        {sources.length === 0 ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dark)', fontStyle: 'italic', padding: '8px 0' }}>
            No references loaded. Query Andrew to retrieve grounding context.
          </div>
        ) : (
          sources.map((src, i) => {
            const scorePct = src.score !== undefined ? `${Math.round((1 - src.score) * 100)}%` : '';
            return (
              <div key={i} className="inspector-source-card">
                <div className="inspector-source-title">
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                    {src.title}
                  </span>
                  <span style={{ color: 'var(--figma-purple)', fontSize: '0.65rem' }}>
                    {scorePct} match
                  </span>
                </div>
                <div className="inspector-source-body">
                  {src.text}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
