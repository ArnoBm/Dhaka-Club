const securityRoles = ['Super Admin', 'Admin', 'Security Staff', 'Staff'];
const adminRoles = ['Super Admin', 'Admin'];

function requireRoles(roles) {
    return (req, res, next) => {
        const role = req.admin && req.admin.role;
        const normalizedRole = role === 'Staff' ? 'Security Staff' : role;

        if (!normalizedRole || !roles.includes(normalizedRole)) {
            return res.status(403).json({ message: 'You do not have permission to access this resource.' });
        }

        next();
    };
}

module.exports = {
    adminRoles,
    securityRoles,
    requireRoles,
};
