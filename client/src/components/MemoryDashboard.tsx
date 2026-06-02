import React from 'react';

interface MemoryData {
  userName: string;
  userAge: string;
  userBackground: string;
  topicsDiscussed: string[];
  userGoals: string;
  lastInteracted: string;
}

interface MemoryDashboardProps {
  memory: MemoryData | null;
  onResetMemory: () => void;
}

export const MemoryDashboard: React.FC<MemoryDashboardProps> = ({ memory, onResetMemory }) => {
  if (!memory) {
    return (
      <div className="inspector-card">
        <div className="inspector-label">Memory Inspector</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>Connecting to memory engine...</div>
      </div>
    );
  }

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Just now';
    }
  };

  return (
    <div className="inspector-card">
      <div className="inspector-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Student Profile Memory</span>
        <button 
          onClick={onResetMemory} 
          style={{ background: 'transparent', border: 'none', color: 'var(--figma-orange)', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Reset
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {/* Name */}
        <div className="inspector-property">
          <span className="property-name">Name</span>
          <span className="property-value" style={{ fontWeight: 650, color: 'white' }}>{memory.userName}</span>
        </div>

        {/* Age */}
        <div className="inspector-property">
          <span className="property-name">Age</span>
          <span className="property-value">{memory.userAge || 'Not specified'}</span>
        </div>

        {/* Level */}
        <div className="inspector-property">
          <span className="property-name">Level</span>
          <span className="property-value">{memory.userBackground}</span>
        </div>

        {/* Goals */}
        <div className="inspector-property">
          <span className="property-name">Goals</span>
          <span className="property-value" style={{ color: 'var(--text-muted)' }}>{memory.userGoals}</span>
        </div>

        {/* Last Seen */}
        <div className="inspector-property">
          <span className="property-name">Last Active</span>
          <span className="property-value">{formatDate(memory.lastInteracted)}</span>
        </div>
      </div>

      {/* Topics Discussed Tags */}
      <div>
        <div className="inspector-label" style={{ fontSize: '0.68rem', marginBottom: '6px' }}>Mastered Topics</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {memory.topicsDiscussed.length === 0 ? (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dark)', fontStyle: 'italic' }}>
              No lessons discussed yet.
            </span>
          ) : (
            memory.topicsDiscussed.map((topic, i) => (
              <span key={i} className="figma-tag" style={{ borderLeft: '3px solid var(--figma-blue)' }}>
                {topic}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
