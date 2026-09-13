import React from 'react';

const VALID_EMOTIONS = ['happy', 'shy', 'excited', 'sad', 'curious', 'neutral'];
const VALID_ANIMATIONS = ['wave', 'talk', 'thinking', 'idle'];

const EMOTION_EMOJI = {
  happy: '😊', shy: '🙈', excited: '🤩', sad: '😔', curious: '🤔', neutral: '🙂',
};

function AvatarFace({ emotion = 'neutral', animation = 'idle' }) {
  const safeEmotion = VALID_EMOTIONS.includes(emotion) ? emotion : 'neutral';
  const safeAnimation = VALID_ANIMATIONS.includes(animation) ? animation : 'idle';
  const className = `avatar-face avatar-emotion-${safeEmotion} avatar-animation-${safeAnimation}`;

  return (
    <div className={className} data-emotion={safeEmotion} data-animation={safeAnimation}>
      <div className="avatar-face-circle">
        <span className="avatar-face-emoji" aria-hidden="true">{EMOTION_EMOJI[safeEmotion]}</span>
      </div>
      <span className="avatar-face-sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        Luna đang {safeEmotion === 'neutral' ? 'bình thường' : safeEmotion}, {safeAnimation === 'idle' ? 'đứng yên' : safeAnimation}
      </span>
    </div>
  );
}

export default AvatarFace;
export { VALID_EMOTIONS, VALID_ANIMATIONS };
