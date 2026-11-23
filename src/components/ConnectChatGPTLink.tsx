import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import openaiLogo from '@/assets/ai-logos/openai.png';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The existing Riftn listing. ChatGPT owns installation and starts OAuth.
const CHATGPT_APP_URL =
  'https://chatgpt.com/apps#settings/Connectors?connector=asdk_app_6a4962fb2cdc8191afcda7ca74b6082c';

export default function ConnectChatGPTLink({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <Button asChild className={cn('min-h-11 gap-2 rounded-xl bg-white px-4 font-semibold text-black hover:bg-white/90', className)}>
      <a href={CHATGPT_APP_URL} target="_blank" rel="noopener noreferrer">
        <img src={openaiLogo} alt="" className="size-4 object-contain" />
        {t('accountConnect.connectChatGPT', { defaultValue: 'Connect to ChatGPT' })}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </Button>
  );
}
