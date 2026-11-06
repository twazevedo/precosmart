const axios = require('axios');

async function test() {
  const url = 'https://vt.tiktok.com/ZS9f1p5GPeP6Q-SyLby/';
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    }
  });
  console.log('Final URL:', res.request?.res?.responseUrl);
  const scripts = res.data.match(/src="([^"]+)"/g) || [];
  console.log('Scripts src:', scripts);
  const inline = res.data.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log('Inline script count:', inline.length);
  inline.forEach((s, i) => {
    console.log(`Inline #${i} (length ${s.length}):`, s.substring(0, 300));
  });
}
test();
