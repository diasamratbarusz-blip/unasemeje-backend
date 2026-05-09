const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth"); // Added for session verification
const Service = require("../models/Service");
const { calculateSellingPrice } = require("../utils/priceCalculator");

/**
 * PERMANENT IDENTITY LOCK
 * Only allows requests from diasamratbarusz@gmail.com or 0715509440.
 */
const identityGuard = (req, res, next) => {
    const OWNER_EMAIL = "diasamratbarusz@gmail.com".toLowerCase();
    const OWNER_PHONE_CORE = "715509440";

    const isEmailMatch = req.user && req.user.email && req.user.email.toLowerCase() === OWNER_EMAIL;
    const isPhoneMatch = req.user && req.user.phone && String(req.user.phone).includes(OWNER_PHONE_CORE);

    if (isEmailMatch || isPhoneMatch) {
        next();
    } else {
        return res.status(403).json({ error: "Access Denied: Administrative Identity Lock Active" });
    }
};

// ✅ CREATE SERVICE
router.post("/add", auth, identityGuard, async (req, res) => {
    try {
        const {
            serviceId,
            name,
            category,
            providerRate,
            profitMargin,
            min,
            max
        } = req.body;

        // Automatically calculate KES price using your markup logic
        const sellingRate = calculateSellingPrice(providerRate, profitMargin);

        const service = new Service({
            serviceId,
            name,
            category,
            providerRate,
            profitMargin,
            sellingRate,
            min,
            max
        });

        await service.save();
        res.json({ message: "Service created successfully", service });
    } catch (err) {
        res.status(500).json({ error: "Error adding service" });
    }
});

// ✏️ UPDATE SERVICE
router.put("/update/:id", auth, identityGuard, async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) return res.status(404).json({ error: "Service not found" });

        // Update fields provided in the request body
        Object.assign(service, req.body);

        // Re-calculate the selling price based on new provider rates or margins
        service.sellingRate = calculateSellingPrice(
            service.providerRate,
            service.profitMargin
        );

        await service.save();
        res.json({ message: "Service updated and price recalculated", service });
    } catch (err) {
        res.status(500).json({ error: "Error updating service" });
    }
});

// ❌ DELETE SERVICE
router.delete("/delete/:id", auth, identityGuard, async (req, res) => {
    try {
        const deleted = await Service.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Service not found" });
        res.json({ message: "Service deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Error deleting service" });
    }
});

// 📦 GET ALL SERVICES (ADMIN VIEW)
router.get("/all", auth, identityGuard, async (req, res) => {
    try {
        const services = await Service.find().sort({ category: 1 });
        res.json(services);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch services" });
    }
});

// 🔄 BULK PRICE UPDATE (Useful for provider price changes)
router.post("/bulk-markup", auth, identityGuard, async (req, res) => {
    try {
        const { newProfitMargin } = req.body;
        const services = await Service.find();

        for (let service of services) {
            service.profitMargin = newProfitMargin;
            service.sellingRate = calculateSellingPrice(service.providerRate, newProfitMargin);
            await service.save();
        }

        res.json({ message: `Updated markup for ${services.length} services` });
    } catch (err) {
        res.status(500).json({ error: "Bulk update failed" });
    }
});

module.exports = router;
