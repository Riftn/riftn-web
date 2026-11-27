import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ArrowLeft from '@/components/ui/cut-icons/back';
import { SEOHead } from '@/components/SEOHead';
import AccountConnection from '@/components/AccountConnection';
import ConnectChatGPTLink from '@/components/ConnectChatGPTLink';
import ogImage from '@/assets/og-chatgpt.jpg';

const PAGE_URL = 'https://riftn.com/connect/chatgpt';
const OG_IMAGE = new URL(ogImage, PAGE_URL).href;

export default function ConnectChatGPTPage() {
  const { t } = useTranslation();
  const [query] = useSearchParams();
  const requestId = query.get('authorization');

  return (
    <div data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black text-white">
      <SEOHead
        title={t('accountConnect.chatgptTitle', { defaultValue: 'Riftn for ChatGPT' })}
        description={t('accountConnect.chatgptDescription', { defaultValue: 'Connect your Riftn account to ChatGPT to browse posts, manage your profile and use Creator Studio.' })}
        url={PAGE_URL}
        image={OG_IMAGE}
        type="article"
      />

      <main className="mx-auto max-w-3xl px-4 py-8 md:py-14">
        {requestId ? (
          <AccountConnection key={requestId} />
        ) : (
          <>
            <Link to="/app" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-white/70 hover:text-white">
              <ArrowLeft className="size-4" />
              {t('copy.2e69c1cda2b3', { defaultValue: 'Back to Riftn' })}
            </Link>

            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              {t('accountConnect.chatgptTitle', { defaultValue: 'Riftn for ChatGPT' })}
            </h1>
            <p className="mt-2 max-w-xl text-base text-white/70 md:text-lg">
              {t('accountConnect.chatgptDescription', { defaultValue: 'Connect your Riftn account to ChatGPT to browse posts, manage your profile and use Creator Studio.' })}
            </p>
            <ConnectChatGPTLink className="mt-5" />
            <p className="mt-3 text-sm text-white/70">
              {t('accountConnect.chatgptInstructions', { defaultValue: 'Choose Connect in ChatGPT, then sign in to Riftn and approve access.' })}
            </p>

            <AccountConnection />

            <section className="mt-10">
              <h2 className="text-xl font-semibold">{t('copy.7887eb17f548', { defaultValue: 'Prompts to try' })}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/80">
                <li>{t('copy.276b978fa5ec', { defaultValue: 'Summarise the top 10 trending posts on Riftn right now.' })}</li>
                <li>{t('accountConnect.libraryPrompt', { defaultValue: 'Show the latest assets in my Riftn Creator library.' })}</li>
                <li>{t('accountConnect.generatePrompt', { defaultValue: "Show me Riftn's image models and quote a portrait before generating it." })}</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
