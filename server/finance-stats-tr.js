// Public finance copy is composed by the worker and the managed finance
// function. Match the English descriptions as delivered so a newly introduced
// source or revised accounting disclosure keeps its original wording.
const labels = new Map([
  ['DHB bought by card', 'Kartla alınan DHB'],
  ['DHB bought with crypto', 'Kriptoyla alınan DHB'],
  ['Pro plans', 'Pro planları'],
  ['AI generations', 'Yapay zekâ üretimleri'],
  ['Ads', 'Reklamlar'],
  ['Post credits', 'Gönderi kredileri'],
  ['Extra posts', 'Ek gönderiler'],
  ['Voice clones', 'Ses klonları'],
  ['Live dubbing', 'Canlı dublaj'],
  ['YouTube imports', "YouTube'dan içe aktarımlar"],
  ['SMS credits', 'SMS kredileri'],
  ['Creator subscription fees', 'İçerik üreticisi abonelik ücretleri'],
  ['Work marketplace fees', 'İş pazaryeri ücretleri'],
  ['AI generation providers', 'Yapay zekâ üretim sağlayıcıları'],
  ['AI text APIs', 'Yapay zekâ metin API’leri'],
  ['Card processing', 'Kart işlem ücretleri'],
  ['Historical operating revenue', 'Geçmiş dönem faaliyet geliri'],
  ['NFT marketplace sales', 'NFT pazaryeri satışları'],
  ['Tip platform fees', 'Bahşiş platform ücretleri'],
  ['Pay-per-view platform fees', 'İzleme başına ödeme platform ücretleri'],
  ['Paid message platform fees', 'Ücretli mesaj platform ücretleri'],
  ['BNB sharing to holders and stakers', 'Token sahipleri ve stake edenlerle paylaşılan BNB'],
  ['Estimated operations', 'Tahmini faaliyet giderleri'],
  ['NFT wallet transfers (not revenue)', 'NFT cüzdan transferleri (gelir dışı)'],
  ['Riftn operations', 'Riftn faaliyetleri'],
  ['Bought back and burned', 'Geri alınıp yakılan'],
  ['Paid to holders and stakers', 'Token sahiplerine ve stake edenlere ödenen'],
  ['Paid into the holder rewards contract', 'Token sahiplerinin ödül sözleşmesine aktarılan'],
  ['NFT marketplace shop wallet', 'NFT pazaryeri mağaza cüzdanı'],
]);

const descriptions = new Map([
  ['Card purchases of DHB through Riftn Pay that settled and were not refunded, at the amount charged.', 'Riftn Pay üzerinden kartla yapılan, tamamlanan ve iade edilmeyen DHB alımları, tahsil edilen tutar üzerinden hesaplanır.'],
  ['Crypto purchases of DHB through Riftn Pay that completed, at the USD value that settled.', 'Riftn Pay üzerinden kriptoyla yapılan tamamlanmış DHB alımları, tahsil edilen tutarın USD karşılığı üzerinden hesaplanır.'],
  ['Paid subscription invoices in Stripe for the Creator, Ultra, Team and Scale plans.', 'Creator, Ultra, Team ve Scale planlarının Stripe üzerinden ödenen abonelik faturaları.'],
  ['DHB paid for image, video, music and 3D generations, less refunds for jobs that failed, plus generations paid from credits.', 'Görsel, video, müzik ve 3B üretimler için ödenen DHB. Başarısız işlemlerin iadeleri düşülür, kredilerle ödenen üretimler dahil edilir.'],
  ['Ad budget top-ups, at the USD value recorded when they were paid.', 'Reklam bütçesine yapılan yüklemeler, ödeme sırasında kaydedilen USD değeriyle hesaplanır.'],
  ['Social post credit packs, at the USD value recorded when they were paid.', 'Gönderi kredisi paketleri, ödeme sırasında kaydedilen USD değeriyle hesaplanır.'],
  ['DHB settled for posting beyond the free daily allowance.', 'Günlük ücretsiz gönderi hakkı aşıldığında tahsil edilen DHB.'],
  ['DHB paid to clone a voice.', 'Ses klonlamak için ödenen DHB.'],
  ['Settled minutes of live stage dubbing, at the per-minute DHB price.', 'Ödemesi tamamlanan canlı sahne dublajı dakikaları, dakika başına DHB fiyatıyla hesaplanır.'],
  ['DHB settled to import a YouTube channel.', 'YouTube kanalı içe aktarmak için tahsil edilen DHB.'],
  ['DHB deposited for SMS notification credits, at the USD value recorded on deposit.', 'SMS bildirim kredileri için yatırılan DHB, yatırma sırasında kaydedilen USD değeriyle hesaplanır.'],
  ['The platform fee kept from each fan subscription — 10% with no badge, down to 1% for the top badge.', 'Her hayran aboneliğinden alınan platform ücreti rozetsiz hesaplarda %10, en üst rozette %1’dir.'],
  ['The difference between what a job poster paid and what the worker received, on confirmed payouts.', 'Onaylanan ödemelerde işi ilan edenin ödediği tutarla işi yapanın aldığı tutar arasındaki fark.'],
  ['What fal, kie and Replicate billed for each successful generation — paid and free — worked back from the price and markup it ran at.', 'Ücretli ve ücretsiz her başarılı üretim için fal, kie ve Replicate’in faturalandırdığı tutar, işlem fiyatı ve uygulanan kâr payı üzerinden geriye dönük hesaplanır.'],
  ['Known text-model tokens at list price before account allowances, caching discounts or reseller adjustments. Incomplete prices and missing usage are reported; this is not a reconciled invoice.', 'Fiyatı bilinen metin modeli tokenları, hesap kotaları, önbellek indirimleri ve bayi düzeltmeleri öncesindeki liste fiyatıyla hesaplanır. Eksik fiyat ve kullanım verileri belirtilir. Bu tutar, mutabakatı yapılmış bir fatura değildir.'],
  ['DigitalOcean’s own invoices, and its month-to-date usage for the month still running.', 'DigitalOcean’ın faturaları ve içinde bulunulan ayın bugüne kadarki kullanımı.'],
  ['Stripe’s fee on each card purchase of DHB.', 'Stripe’ın kartla yapılan her DHB alımından aldığı ücret.'],
  ['Cloudflare billing charges in USD, recorded on their billing date. Bills can arrive after usage; unbilled usage is not estimated. Billing access is unavailable until a read-only billing token is connected.', 'Cloudflare ücretleri fatura tarihinde USD olarak kaydedilir. Faturalar kullanımdan sonra gelebilir. Faturalanmamış kullanım için tahmin yapılmaz. Salt okunur bir faturalandırma anahtarı bağlanana kadar faturalara erişilemez.'],
  ['Cloudflare USD charges, refunds and credits on their billing date, refreshed every five minutes. Unbilled usage is excluded until Cloudflare reports a charge.', 'Cloudflare ücretleri, iadeleri ve alacakları fatura tarihinde USD olarak kaydedilir ve beş dakikada bir güncellenir. Cloudflare bir ücret bildirene kadar faturalanmamış kullanım hesaba katılmaz.'],
  ['Verified successful Purchased events from the production NFT checkout, reconciled to actual receipts in the shop wallet. Internal company purchases are listed as transfers instead of new revenue.', 'Canlı NFT ödeme sistemindeki başarılı Purchased olayları doğrulanır ve mağaza cüzdanındaki gerçek tahsilatlarla karşılaştırılır. Şirket içi alımlar transfer olarak gösterilir.'],
  ['The current payment policy passes this payment to the creator with no platform cut. The platform fee is zero.', 'Mevcut ödeme politikasına göre ödemenin tamamı içerik üreticisine aktarılır. Platform ücreti sıfırdır.'],
  ['BNB paid to holders and stakers, valued in USD on each payment date. Included in the gross historical revenue view at the requested scope; this was distributed to participants, not retained by Riftn.', 'Token sahiplerine ve stake edenlere ödenen BNB, her ödeme tarihindeki USD değeriyle hesaplanır. Brüt geçmiş gelire dahil edilen bu tutarın tamamı katılımcılara dağıtılmıştır.'],
  ['Operating costs before 1 April 2026 follow a historical estimate, peaking at $100,000 a month in November 2021. From 1 April 2026, only recorded provider costs and subscriptions are included, with no estimated operations top-up. Provider reporting can lag; unavailable bills are excluded, not zero.', '1 Nisan 2026 öncesindeki faaliyet giderleri geçmişe dönük tahminlere dayanır. Tahmin, Kasım 2021’de aylık 100.000 ABD dolarıyla zirveye ulaştı. 1 Nisan 2026’dan itibaren yalnızca kaydedilen sağlayıcı giderleri ve abonelikler dahil edilir. Sağlayıcıların bildirimi gecikebilir. Erişilemeyen faturalar hesap dışında bırakılır.'],
  ['Direct wallet movements, staking rewards, swaps and internal company purchases are not new NFT sales. Outgoing transfers are not automatically classified as refunds.', 'Doğrudan cüzdan hareketleri, staking ödülleri, takaslar ve şirket içi alımlar yeni NFT satışı olarak sayılmaz. Giden transferler otomatik olarak iade kabul edilmez.'],
  ['BUSD and USDT are booked at their $1 face value. BNB uses the Binance BNBUSDT close on the UTC day. The two original DeHub purchases use the historical DeHub/WBNB pool reserves at the purchase block and that day’s BNB close. Other DeHub/DHB wallet movements remain unpriced and excluded from revenue totals.', 'BUSD ve USDT, 1 ABD doları nominal değeriyle kaydedilir. BNB için Binance BNBUSDT çiftinin UTC gün kapanışı kullanılır. İlk iki DeHub alımında, alımın gerçekleştiği bloktaki DeHub/WBNB havuz rezervleri ve o günün BNB kapanışı esas alınır. Diğer DeHub/DHB cüzdan hareketlerine fiyat atanmaz ve bu hareketler gelir toplamına dahil edilmez.'],
  ['Amounts paid in DHB are valued at DHB’s live market price on DexScreener when a pool holds at least $10,000 of liquidity, and otherwise at the $0.001 gateway peg the app sells and spends DHB at. Amounts already recorded in USD keep that value; other fiat uses the ECB reference rate.', 'DHB ödemeleri, en az 10.000 ABD doları likiditesi olan bir havuz varsa DexScreener’daki anlık DHB fiyatıyla değerlenir. Diğer durumlarda uygulamanın DHB satışı ve harcamalarında kullandığı 0,001 ABD doları sabit kuru geçerlidir. USD olarak kaydedilen tutarlar korunur. Diğer itibari para birimleri için Avrupa Merkez Bankası’nın referans kuru kullanılır.'],
  ['Tips, pay-per-view and paid DMs go from fan to creator with no platform cut, so they are not revenue.', 'Bahşişler, izleme başına ödemeler ve ücretli özel mesaj ödemeleri kesintisiz olarak hayrandan içerik üreticisine aktarılır ve platform gelirine dahil edilmez.'],
  ['DHB credit balances are counted when they are spent on a Riftn product, not when they are loaded, so the same money is not counted twice.', 'Aynı tutarı iki kez saymamak için DHB kredileri, bakiye yüklenirken değil, bir Riftn ürününde harcandığında hesaba katılır.'],
  ['Bills with no API — hosting and tools other than those listed — appear only once they are added to the fixed-cost list.', 'API üzerinden alınamayan barındırma ve araç faturaları, sabit gider listesine eklendikten sonra gösterilir.'],
  ['Missing app payment sources were read directly from the public core API. Fiat conversion uses current ECB reference rates, as in the managed finance endpoint.', 'Eksik uygulama ödemeleri doğrudan herkese açık ana API’den alındı. İtibari para birimleri, yönetilen finans uç noktasında olduğu gibi Avrupa Merkez Bankası’nın güncel referans kurlarıyla çevrilir.'],
  ['Successful native and recognised-token movements into and out of the shop wallet. Transfers are retained for reconciliation and never counted as fresh revenue. Unpriced token movements retain their original amounts.', 'Mağaza cüzdanına giren veya cüzdandan çıkan, başarıyla tamamlanmış yerel varlık ve tanınan token hareketleri. Transferler mutabakat için saklanır ve yeni gelire dahil edilmez. Fiyatı belirlenmemiş token hareketlerinin özgün tutarları korunur.'],
  ['The retained operating funds were fully reinvested, as reported by DeHub. Marketing and developer wages are shown together rather than allocating an unsupported split.', 'DeHub’ın bildirdiğine göre, elde tutulan faaliyet fonlarının tamamı yeniden yatırıma ayrıldı. Ayrı tutarları doğrulanamadığı için pazarlama ve geliştirici ücretleri birlikte gösterilir.'],
  ['Wallet transfers are visible for reconciliation and excluded from revenue totals.', 'Cüzdan transferleri mutabakat için gösterilir ve gelir toplamlarına dahil edilmez.'],
  ["Where the original Riftn token's trading tax went, from launch in August 2021 to the last tax payout in March 2023. Traced once from BNB Smart Chain; every figure is valued in USD at that day's Binance BNBUSDT close and can be re-checked on BscScan.", 'İlk Riftn tokenının işlem vergisinin, Ağustos 2021’deki lansmandan Mart 2023’teki son vergi ödemesine kadar nasıl dağıtıldığı. Veriler BNB Smart Chain’den bir kez derlendi. Her tutar, o günün Binance BNBUSDT kapanış fiyatıyla USD olarak değerlenir ve BscScan’de doğrulanabilir.'],
  ['Every BuybackDone event on the token: the BNB the contract spent buying Riftn from the PancakeSwap pair, and the tokens that pair sent to the burn address in the same transaction.', 'Tokenın tüm BuybackDone olayları. Sözleşmenin PancakeSwap çiftinden Riftn almak için harcadığı BNB ve aynı işlemde bu çiftin yakım adresine gönderdiği tokenlar gösterilir.'],
  ["Every ClaimedBNBRewards (holders) and SentBNBRewards (stakers) event on the rewards contract, totalled per day. The contract's own totalClaimed counter agrees. A further 1.40 BNB was claimed straight from the token in its first two weeks, before the rewards contract existed; the token records only a running total for those, so they are not in the daily figures.", 'Ödül sözleşmesindeki tüm ClaimedBNBRewards (token sahipleri) ve SentBNBRewards (stake edenler) olayları gün bazında toplanır. Sözleşmenin totalClaimed sayacı da bu toplamı doğrular. Ödül sözleşmesi oluşturulmadan önceki ilk iki haftada doğrudan tokendan 1,40 BNB daha talep edildi. Token bu ödemeler için yalnızca birikimli toplam tuttuğundan, bunlar günlük rakamlara dahil edilmez.'],
]);

const accountingNumber = new Intl.NumberFormat('tr-TR');
const count = value => accountingNumber.format(Number(value));
const historicalTax = "The share of the original Riftn token's 12% trading tax that went to Riftn operations as BNB: the 2% collateral and 2% distribution sales the tax router paid to the operations wallets, plus the collateral BNB the contract paid the owner wallet, less the BNB those operations wallets passed on to the holders' rewards contract — that part belonged to holders and stakers, so it is subtracted here and shown as shared instead. The 4% buyback (burned), 2% liquidity and 1% reflection are not counted. ";

const templates = [
  [/^(\d+) text requests have no verified model price and are excluded from the text-cost subtotal; a free route label does not prove zero spend\.$/, n => `${count(n)} metin isteğinin model fiyatı doğrulanamadığı için bu istekler metin maliyetlerinin ara toplamına dahil edilmedi. Bir rotanın ücretsiz olarak etiketlenmesi, hiç harcama yapılmadığını göstermez.`],
  [/^(\d+) text requests lack complete token usage; reported costs are incomplete\.$/, n => `${count(n)} metin isteğinin token kullanım verisi eksik. Bu nedenle bildirilen maliyetler eksiktir.`],
  [/^Cloudflare text usage has a known list-price subtotal of \$(\d+\.\d+) before allowances; excluded from text costs because Cloudflare account billing is reported separately\. This subtotal excludes missing token reports and unknown models\.$/, amount => `Cloudflare metin kullanımının kotalar öncesi bilinen liste fiyatı ara toplamı ${amount.replace('.', ',')} ABD dolarıdır. Cloudflare hesap faturaları ayrı raporlandığı için bu tutar metin giderlerine eklenmez. Token raporu eksik istekler ve fiyatı bilinmeyen modeller ara toplama dahil edilmez.`],
  [/^(\d+) free generations used a model with no cost entry and are not in AI generation costs\.$/, n => `${count(n)} ücretsiz üretimde maliyeti kaydedilmemiş bir model kullanıldı. Bu üretimler yapay zekâ üretim maliyetlerine dahil edilmedi.`],
  [/^(\d+) days of card payments were in a currency with no exchange rate today and are left out\.$/, n => `${count(n)} günlük kart ödemesi, bugün döviz kuru bulunamayan bir para biriminde yapıldığı için hesap dışında bırakıldı.`],
  [/^Riftn's core API could not be read this time \((.+)\), so in-app buys and the fees it reports are left out until the next read\.$/, reason => `Riftn’ın ana API’sine bu sefer erişilemedi (${reason}). Uygulama içi alımlar ve bu API’nin bildirdiği ücretler bir sonraki sorguya kadar hesap dışında bırakıldı.`],
  [/^Fixed bill of \$([\d,.]+) a month since (\d{4}-\d{2}-\d{2}), spread evenly across each day\.$/, (amount, since) => `${since} tarihinden beri aylık ${amount.replaceAll(',', '.')} ABD doları tutarındaki sabit fatura, ayın günlerine eşit olarak dağıtılır.`],
];

function translateDescription(text) {
  if (!text) return text;
  const translated = descriptions.get(text);
  if (translated) return translated;
  if (text.startsWith(historicalTax)) {
    const totals = /^(\d+) payouts from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}): ([\d,.]+) BNB received, ([\d,.]+) BNB passed on to holders, ([\d,.]+) BNB to Riftn operations\.$/.exec(text.slice(historicalTax.length));
    if (totals) {
      const [, payouts, from, to, received, shared, operations] = totals;
      const bnb = value => value.replace(/[,.]/g, c => c === ',' ? '.' : ',');
      return `İlk Riftn tokenının %12 işlem vergisinden BNB olarak Riftn faaliyetlerine ayrılan pay. Vergi yönlendiricisinin faaliyet cüzdanlarına ödediği %2 teminat ve %2 dağıtım satışları ile sözleşmenin sahip cüzdanına ödediği teminat BNB’si dahildir. Faaliyet cüzdanlarından ödül sözleşmesine aktarılan BNB düşülür ve token sahipleriyle stake edenlere dağıtılan tutar olarak gösterilir. %4 geri alım (yakılan), %2 likidite ve %1 yansıtma hesaba katılmaz. ${from} ile ${to} arasındaki ${count(payouts)} ödemede ${bnb(received)} BNB alındı, ${bnb(shared)} BNB token sahiplerine aktarıldı ve ${bnb(operations)} BNB Riftn faaliyetlerine ayrıldı.`;
    }
  }
  for (const [pattern, translate] of templates) {
    const match = pattern.exec(text);
    if (match) return translate(...match.slice(1));
  }
  return text;
}

export function translateFinanceStats(body) {
  const translateLabel = label => labels.get(label) ?? label;
  const localized = {
    ...body,
    sources: body.sources.map(source => ({
      ...source,
      label: translateLabel(source.label),
      note: translateDescription(source.note),
    })),
  };
  if (body.notes) localized.notes = body.notes.map(translateDescription);
  if (body.addresses) localized.addresses = body.addresses.map(address => ({ ...address, label: translateLabel(address.label) }));
  if (body.provenance) {
    const { conversion, excluded, expenseAllocation } = body.provenance;
    localized.provenance = {
      ...body.provenance,
      conversion: translateDescription(conversion),
      excluded: excluded?.map(translateDescription),
      expenseAllocation: translateDescription(expenseAllocation),
    };
  }
  return localized;
}
