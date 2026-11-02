import { Sparkles } from 'lucide-react';

function PetCharacter() {
  return (
    <div className="pet-scene" aria-label="Momo 桌宠">
      <div className="pet-shadow" />
      <div className="pet-character">
        <div className="pet-ear pet-ear-left" />
        <div className="pet-ear pet-ear-right" />
        <div className="pet-head">
          <span className="pet-eye pet-eye-left" />
          <span className="pet-eye pet-eye-right" />
          <span className="pet-cheek pet-cheek-left" />
          <span className="pet-cheek pet-cheek-right" />
          <span className="pet-mouth" />
          <span className="pet-forehead-mark"><Sparkles size={14} strokeWidth={2.6} /></span>
        </div>
        <div className="pet-body">
          <span className="pet-badge" />
          <span className="pet-arm pet-arm-left" />
          <span className="pet-arm pet-arm-right" />
        </div>
        <div className="pet-foot pet-foot-left" />
        <div className="pet-foot pet-foot-right" />
      </div>
    </div>
  );
}

export default PetCharacter;
