# UNIVIA – Dünyayı Tanı. Bulunduğun Yeri Takip Et.

Dünya ve yerel bilgi rehberi: HTML/PWA olarak çalışır, Capacitor ile Android APK'ya paketlenir.

## Hızlı başlangıç
- **Tarayıcıda:** `www/index.html` dosyasını açın (veya tek dosyalık `UNIVIA.html`). İnternet varsa canlı veriler gelir.
- **PWA (kurulabilir, çevrimdışı kabuk):** `npm run serve` → http://localhost:8080. Service worker yalnızca http(s) üzerinden çalışır.
- **APK (GitHub ile):** Bu klasörü bir GitHub deposuna yükleyin → *Actions* → **UNIVIA APK** iş akışı otomatik çalışır → *Artifacts* altından `UNIVIA-apk` indirilir (içinde `UNIVIA.apk`).
  Yerelde: `npm install && npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug` (JDK 17 + Android SDK gerekir).

## Veri ve "son güncel veri" kuralı
Her dinamik blok **Kaynak** ve **Son kontrol** tarihini gösterir. Kaynağa ulaşılamazsa, internet yoksa veya kaynak **boş/eksik veri** döndürürse
uygulama son kaydedilen veriyi **kaydedildiği tarihle** gösterir (“Son güncel veri gösteriliyor: …”). Eksik gelen alanlar (ör. anlık hava) alan bazında
eski değeri ve eski tarihiyle korunur. Hiç kayıt yoksa açıkça “veri yok” denir; uydurma veri üretilmez. Demo içerik her yerde **Demo veri** etiketlidir.

| Bilgi | Kaynak (anahtarsız) | Önbellek |
|---|---|---|
| Yer arama | Open-Meteo Geocoding (GeoNames), OSM Nominatim | 30 gün |
| Hava | Open-Meteo | 30 dk |
| Tanıtım, yakındaki yerler, görseller | Vikipedi | 7 gün |
| Ülke profili | REST Countries | 30 gün |
| Yerel yaşam, restoran, otel, eczane… | OpenStreetMap Overpass | 7 gün |
| Güncel gelişmeler | Google Haberler RSS, Bing Haberler RSS, resmî kurum duyuruları (gov.tr / bel.tr…), GDELT, kullanıcıların eklediği kaynaklar | 1 saat |
| Yerel yaşam (resmî/açık) | Wikidata (nüfus geçmişi, resmî site, posta kodu), OSM (okul, sağlık, eczane, toplanma alanı, muhtarlık…), TÜİK / e-Devlet bağlantıları | 7 gün |
| Etkinlik, AI | Kendi proxy'niz (CONFIG) | 1 gün |

## CONFIG
`index.html` başındaki `window.UNIVIA_CONFIG` bölümünden servisler açılıp kapanır, proxy adresleri ve `backend.baseUrl` girilir.
**API anahtarlarını dosyaya yazmayın**; anahtar proxy sunucusunda tutulmalı.

## Kullanıcı katkıları
Backend yokken katkılar cihazda (IndexedDB) saklanır. `backend.baseUrl` verildiğinde şu uçlar kullanılır:
`GET /contributions?locality=ID`, `POST /contributions`, `POST /contributions/:id/{votes|sources|updates|reports}`, `POST /reports`, `POST /moderation/:id`.
Şema: `backend/schema.sql`. Akış: kullanıcı bildirir → otomatik moderasyon → yayın veya inceleme → topluluk oyu → kaynak eklenir → güven seviyesi güncellenir.

## Lisans/atıf
Harita © OpenStreetMap katkıcıları (ODbL). Vikipedi içerikleri CC BY-SA. OSM döşeme sunucusu yoğun ticari kullanım için uygun değildir; üretimde kendi döşeme sağlayıcınızı CONFIG'e girin.

## Haber ve belediye sitelerini okuma (CORS)
Tarayıcılar, izin vermeyen siteleri doğrudan okutmaz. UNIVIA sırasıyla şunları dener: **APK'da yerel istek** (CapacitorHttp açık; aracıya gerek yok) →
**kendi sunucunuz** (`backend.baseUrl` veya `providers.proxy.url`) → doğrudan → **herkese açık aracılar** (allorigins, codetabs, corsproxy; Ayarlar'dan kapatılabilir).

## Kullanıcıların eklediği bilgi kaynakları (herkese ulaşması)
Bir yerin **Güncel gelişmeler** sekmesinde “➕ Bilgi kaynağı ekle” ile RSS akışı veya web sayfası (ör. belediye duyuruları) eklenir.
İsteğe bağlı kelime filtresiyle (ör. mahalle adı) yalnızca ilgili başlıklar alınır. Tarihi olmayan sayfa başlıklarında “ilk görülme” tarihi gösterilir.

- **Ortak sunucu varsa:** kaynak sunucuya kaydedilir; o yeri açan veya **Güncelle** diyen herkes bu kaynaktaki bilgileri görür.
- **Sunucu yoksa:** kaynak cihazda kalır; **paylaş** bağlantısını açan kişinin uygulamasına aynı kaynak eklenir.

### Ortak sunucuyu 5 dakikada kurma (Cloudflare, ücretsiz)
1. dash.cloudflare.com → Workers & Pages → **Create** → Worker oluşturun, `backend/worker.js` içeriğini yapıştırıp **Deploy** edin.
2. Workers → **KV** → `UNIVIA` adında namespace oluşturun; Worker → Settings → Bindings → KV namespace, değişken adı **UNIVIA**.
3. Worker → Settings → Variables → **ADMIN_TOKEN** (gizli) ekleyin (moderasyon için).
4. `index.html` başındaki CONFIG'te `backend: { baseUrl: 'https://<worker-adınız>.workers.dev' }` yazın. Proxy otomatik olarak `/proxy` ucunu kullanır.

## Harita
Leaflet dosyanın içine gömülüdür (internet olmadan da yüklenir). Döşemeler sırayla Esri → CARTO → OpenStreetMap denenir. Hiçbiri yüklenemezse harita tabanı **OpenStreetMap verisinden (yollar, binalar, parklar, sular) çizilir** ve cihazda saklanır; bu veri de alınamazsa **Google Haritalar** gömülü görünümüne geçilir. Her yer sayfasında “Google Haritalar’da aç” bağlantısı vardır. **Güncelle** dendiğinde yerin uydu ve harita görüntüsü yeniden indirilir.

## Güncelle ve tarama süresi
**Güncelle** tüm internet kaynaklarını önbelleği atlayarak yeniden çeker. Üstteki tarama kutusu her kaynağın durumunu, bağlantısını ve süresini;
geçmiş tarama sürelerinden hesaplanan **yaklaşık kalan süreyi** gösterir. Ulaşılamayan kaynakların son kayıtlı verisi tarihiyle gösterilmeye devam eder.

## Etkinlik kaynakları
Etkinlikler sekmesinde “➕ Etkinlik kaynağı ekle” ile takvim (.ics), RSS veya web sayfası eklenebilir. Metindeki tarihler (ör. “15 Ekim’de”) okunur;
tarihi bulunamayanlar “tarihi belirsiz duyurular” altında listelenir. Google Haberler etkinlik araması varsayılan kaynaktır.

## Fotoğraflar
Wikimedia Commons (konuma göre ve ada göre arama), Openverse (açık lisanslı görseller), Vikipedi ve yerel kullanıcı fotoğrafları birleştirilir.
Commons'ta EXIF çekim tarihi varsa o, yoksa yükleme tarihi gösterilir; her fotoğrafta yazar, lisans ve kaynak sayfası bulunur.

## Yerel yaşam: Google ve resmî veriler
- **Google Places:** Anahtar ücretli/kotalı olduğu için uygulamaya gömülmez. Cloudflare Worker'a `GOOGLE_PLACES_KEY` gizli değişkenini ekleyin
  (Google Cloud → Places API (New) etkin), sonra CONFIG'te `googlePlaces: { enabled: true }` yapın. Eczane, okul, hastane, market, cami, park, karakol,
  durak, muhtarlık ve restoranlar puan / açık-kapalı bilgisiyle gelir. Anahtar yoksa her kategori için Google Haritalar bağlantısı verilir.
- **Resmî veriler:** Wikidata'daki resmî internet sitesinin son duyuruları otomatik okunur; nüfus Wikidata'daki resmî istatistik referansıyla (ör. TÜİK ADNKS) gösterilir;
  ülkeye göre resmî açık veri portallarında (data.gov.uk, data.gov, data.gouv.fr, İBB, İzmir) yerin adıyla veri seti aranır; TÜİK ve e-Devlet bağlantıları verilir.

## Son 7 gün özeti
Güncel gelişmeler sekmesinin başında, son 7 günün haberleri konulara ayrılarak özetlenir; her maddede kaynak adı, bağlantısı ve tarihi yer alır.
Başlıklar değiştirilmez. CONFIG'te AI proxy tanımlıysa ayrıca kaynaklı serbest metin özeti istenebilir.

## Otomatik güncelleme
Tarama bitince sayaç başlar ve süre dolunca haber, hava, etkinlik, bildirim ve uyarılar kendiliğinden yeniden çekilir (varsayılan 1 dk; 15 sn / 5 dk / 15 dk / kapalı seçilebilir).
Erişilemeyen kaynaklar 20 → 40 → 80 sn arayla yeniden denenir. Bir yeri tekrar açtığınızda son güncelleme anında gösterilir, ardından yenilenir.

## Haber özetleri
Google Haberler bağlantıları gerçek haber adresine çözülür; haber metni okunur ve en önemli 3 cümle (metindeki sırasıyla) özet olarak gösterilir.
Metin okunamazsa sayfanın kendi açıklaması, o da yoksa kaynağın kısa açıklaması kullanılır. Yeni cümle üretilmez.

## Ülke kaynakları
Dünya Bankası (nüfus, GSYH, enflasyon, işsizlik, yaşam beklentisi, turist sayısı…), Birleşik Krallık ve ABD dışişleri seyahat uyarıları,
ReliefWeb (BM OCHA), USGS ve AFAD deprem kayıtları, ülkenin kendi dilinde Google Haberler.
