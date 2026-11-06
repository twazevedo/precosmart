const ws = new WebSocket('ws://127.0.0.1:9222/inspector/140215738924672');

ws.onopen = () => {
    console.log('Connected to Lynx QuickJS devtools!');
    ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
            expression: 'Object.keys(globalThis)'
        }
    }));
};

ws.onmessage = (event) => {
    console.log('CDP Response:', event.data);
    ws.close();
    process.exit(0);
};

ws.onerror = (err) => {
    console.error('CDP Error:', err.message);
    process.exit(1);
};

setTimeout(() => {
    console.log('Timeout waiting for CDP response');
    process.exit(0);
}, 5000);
