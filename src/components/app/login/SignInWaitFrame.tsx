/**
 * The waiting marks of the sign-in hand-off (the picked arrival), on a page of its own.
 * Used by the pages a login link or a Telegram return lands on, so they look
 * like the sheet they are about to hand over to. No visible words.
 */
import { ArrivalMarks } from './SignInHandoff';
import { useArrivalLook } from '@/lib/arrival-look';
import './sign-in-handoff.css';

export function SignInWaitFrame({ label }: { label: string }) {
  const look = useArrivalLook();
  return (
    <div className="grid min-h-screen place-items-center bg-[#060709]">
      <div className="signin-rift signin-rift--inline" data-arrival={look} data-phase="waiting" role="status" aria-label={label}>
        <div className="signin-rift__stage">
          <ArrivalMarks look={look} />
        </div>
      </div>
    </div>
  );
}

export default SignInWaitFrame;
