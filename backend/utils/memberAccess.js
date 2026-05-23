const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

function getMembershipState(member) {
    if (!member) {
        return 'Unknown';
    }

    if (member.status === 'Suspended') {
        return 'Suspended';
    }

    if (member.status === 'Inactive') {
        return 'Inactive';
    }

    if (member.membership_expiry && new Date(member.membership_expiry) < startOfToday()) {
        return 'Expired';
    }

    return 'Eligible';
}

function canAccessMemberApp(member) {
    return member && member.status !== 'Suspended';
}

function canUseMemberPrivileges(member) {
    return getMembershipState(member) === 'Eligible';
}

async function getMemberAccess(memberId, transaction) {
    const members = await sequelize.query(
        `SELECT id, member_id, full_name, phone, status, membership_expiry
         FROM members
         WHERE id = :id
         LIMIT 1`,
        {
            replacements: { id: memberId },
            type: QueryTypes.SELECT,
            transaction,
        }
    );
    const member = members[0] || null;
    const membership_state = getMembershipState(member);

    return {
        member,
        membership_state,
        can_access_app: canAccessMemberApp(member),
        can_use_privileges: canUseMemberPrivileges(member),
    };
}

function getPrivilegeBlockMessage(access) {
    if (!access.member) {
        return 'Member account was not found.';
    }

    if (access.membership_state === 'Suspended') {
        return 'Your membership is suspended. Please contact Dhaka Club administration.';
    }

    if (access.membership_state === 'Inactive') {
        return 'Your membership is inactive. Please renew or contact Dhaka Club administration to participate.';
    }

    if (access.membership_state === 'Expired') {
        return 'Your membership has expired. You can browse the app, but renewal is required to participate.';
    }

    return 'Your membership is not eligible for this action.';
}

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

module.exports = {
    canAccessMemberApp,
    canUseMemberPrivileges,
    getMemberAccess,
    getMembershipState,
    getPrivilegeBlockMessage,
};
