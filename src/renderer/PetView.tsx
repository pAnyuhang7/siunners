import { useEffect } from 'react';
import PetCharacter from './PetCharacter';

function PetView() {
  useEffect(() => {
    const momo = window.momo;
    if (!momo?.setClickThrough) return;
    let ignoring = true;

    const applyIgnore = (next: boolean) => {
      if (ignoring === next) return;
      ignoring = next;
      momo.setClickThrough(next);
    };
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target as Element | null;
      applyIgnore(!Boolean(target?.closest?.('.pet-hitbox')));
    };
    const onPointerLeave = () => applyIgnore(true);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerleave', onPointerLeave);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <main className="pet-shell">
      <div className="pet-hitbox">
        <button
          className="pet-open"
          type="button"
          title="和 Momo 聊天"
          aria-label="和 Momo 聊天"
          onClick={() => void window.momo?.toggleChat()}
        >
          <PetCharacter />
        </button>
        <div className="pet-hint" aria-hidden="true">点我聊天 · 拖动移动</div>
      </div>
    </main>
  );
}

export default PetView;
