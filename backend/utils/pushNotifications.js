const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function isExpoPushToken(token) {
    return /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(String(token || ''));
}

async function sendExpoPushNotifications(messages) {
    const validMessages = messages.filter((message) => isExpoPushToken(message.to));

    if (!validMessages.length) {
        return [];
    }

    const responses = [];

    for (const batch of chunk(validMessages, 100)) {
        const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(batch),
        });

        const data = await response.json().catch(() => null);
        responses.push({ ok: response.ok, data });
    }

    return responses;
}

module.exports = {
    isExpoPushToken,
    sendExpoPushNotifications,
};
