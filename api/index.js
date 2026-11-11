const scraper = require('./scraper');

module.exports = async (req, res) => {
    // Izinkan CORS agar bisa diakses dari aplikasi Android
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, query, page, slug } = req.query;
    const pageNum = parseInt(page, 10) || 1;

    try {
        let data;
        switch (action) {
            case 'latest':
                data = await scraper.getLatestVideos(pageNum);
                break;
            case 'trending':
                data = await scraper.getTrendingVideos();
                break;
            case 'categories':
                data = await scraper.getCategories();
                break;
            case 'search':
                if (!query) return res.status(400).json({ error: "Parameter 'query' wajib diisi." });
                data = await scraper.searchVideos(query, pageNum);
                break;
            case 'category':
                if (!slug) return res.status(400).json({ error: "Parameter 'slug' wajib diisi." });
                data = await scraper.getCategoryVideos(slug, pageNum);
                break;
            case 'video':
                if (!slug) return res.status(400).json({ error: "Parameter 'slug' atau URL video wajib diisi." });
                data = await scraper.getVideoDetail(slug);
                break;
            default:
                return res.status(400).json({ 
                    error: "Action tidak valid. Gunakan: latest, trending, categories, search, category, atau video." 
                });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
