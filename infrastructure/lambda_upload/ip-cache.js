// ip-based rate-limiter
const ipCache = new Map();

function isRateLimited(ip, limit = 10, windowMs = 60_000) {
    const now = Date.now();
    const record = ipCache.get(ip) || { count: 0, start: now };

    if (now - record.start > windowMs) {
        ipCache.set(ip, { count: 1, start: now });
        return false;
    }

    record.count += 1;
    ipCache.set(ip, record);

    return record.count > limit;
}

module.exports = { isRateLimited };
