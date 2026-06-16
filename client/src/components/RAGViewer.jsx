import React from 'react';

export const RAGViewer = ({ sources }) => {
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
            // Check if score is float (ChromaDB distance score where 0.0 is perfect)
            // or if it's rapidfuzz score (0-100 where 100 is perfect)
            let scorePct = '';
            if (src.score !== undefined) {
              if (src.score <= 1.0) {
                // Cosine distance (1 - distance is similarity)
                scorePct = `${Math.round((1 - src.score) * 100)}%`;
              } else {
                // Fuzzy score (0-100)
                scorePct = `${Math.round(src.score)}%`;
              }
            }
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
