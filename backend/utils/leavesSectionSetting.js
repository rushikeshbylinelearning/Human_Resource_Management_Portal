const Setting = require('../models/Setting');
const cacheService = require('../services/cacheService');

const LEAVES_SECTION_KEY = 'leavesSectionEnabled';

const isLeavesSectionEnabled = async () => {
    const cached = cacheService.getSetting(LEAVES_SECTION_KEY);
    if (cached !== undefined) {
        return !!cached;
    }

    const setting = await Setting.findOne({ key: LEAVES_SECTION_KEY }).lean();
    // Default true so existing deployments keep showing Leaves until an admin turns it off.
    const enabled = setting ? !!setting.value : true;
    cacheService.setSetting(LEAVES_SECTION_KEY, enabled);
    return enabled;
};

const setLeavesSectionEnabled = async (enabled) => {
    const updated = await Setting.findOneAndUpdate(
        { key: LEAVES_SECTION_KEY },
        { value: enabled },
        { upsert: true, new: true }
    );
    const nextValue = !!updated.value;
    cacheService.setSetting(LEAVES_SECTION_KEY, nextValue);
    return nextValue;
};

const attachLeavesSectionFlag = async (userPayload) => {
    if (!userPayload || typeof userPayload !== 'object') {
        return userPayload;
    }
    const enabled = await isLeavesSectionEnabled();
    return { ...userPayload, leavesSectionEnabled: enabled };
};

module.exports = {
    LEAVES_SECTION_KEY,
    isLeavesSectionEnabled,
    setLeavesSectionEnabled,
    attachLeavesSectionFlag,
};
