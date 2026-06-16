import React, { useState, useRef } from 'react';
import { Play, Pause, Volume2, Check } from 'lucide-react';

export const VoiceSelector = ({ selectedVoice, onVoiceChange }) => {
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const audioRef = useRef(null);

  const voices = [
    {
      id: 'en-US-AndrewNeural',
      name: 'Standard US Accent',
      description: 'Clear, calm, standard American phrasing',
      sampleUrl: 'http://localhost:5000/audio/sample-us-andrew.mp3',
    },
    {
      id: 'en-SG-WayneNeural',
      name: 'Singapore Calm Accent',
      description: 'Refined Southeast Asian cadence',
      sampleUrl: 'http://localhost:5000/audio/sample-sg-wayne.mp3',
    },
    {
      id: 'en-HK-SamNeural',
      name: 'Hong Kong Soft Accent',
      description: 'Gentle Eastern pacing',
      sampleUrl: 'http://localhost:5000/audio/sample-hk-sam.mp3',
    },
    {
      id: 'en-GB-ThomasNeural',
      name: 'Precise British Accent',
      description: "Precise dialect representing Andrew's UK roots",
      sampleUrl: 'http://localhost:5000/audio/sample-gb-thomas.mp3',
    },
  ];

  const handlePlayPreview = (voiceId, url, e) => {
    e.stopPropagation(); // Avoid triggering selection

    if (playingVoiceId === voiceId) {
      // Toggle pause
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Play new audio
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);

    audio.play().catch(err => {
      print("Failed to play voice preview:", err);
      setPlayingVoiceId(null);
    });

    audio.onended = () => {
      setPlayingVoiceId(null);
    };
  };

  return (
    <div className="inspector-card">
      <div className="inspector-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Volume2 size={12} style={{ color: 'var(--figma-purple)' }} />
        <span>Voice Clone Profile</span>
      </div>
      
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4' }}>
        Andrew Ng has a unique accent combining his UK birth, Singapore/HK upbringing, and US career. Test the options below to choose his twin:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {voices.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlaying = playingVoiceId === v.id;
          
          return (
            <div 
              key={v.id} 
              onClick={() => onVoiceChange(v.id)}
              style={{
                background: isSelected ? 'rgba(162, 90, 255, 0.08)' : 'var(--bg-subpanel)',
                border: `1px solid ${isSelected ? 'var(--figma-purple)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
              className="voice-item"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span style={{ 
                  fontSize: '0.78rem', 
                  fontWeight: isSelected ? 650 : 500, 
                  color: isSelected ? 'white' : 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {v.name}
                  {isSelected && <Check size={12} style={{ color: 'var(--figma-purple)' }} />}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {v.description}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => handlePlayPreview(v.id, v.sampleUrl, e)}
                style={{
                  background: isPlaying ? 'var(--figma-orange)' : 'rgba(255,255,255,0.06)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.15s ease'
                }}
                title={isPlaying ? "Pause Preview" : "Play Preview"}
              >
                {isPlaying ? <Pause size={10} /> : <Play size={10} style={{ marginLeft: '1px' }} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
