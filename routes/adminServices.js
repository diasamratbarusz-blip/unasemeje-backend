const express = require("express");
const router = express.Router();

const Service = require("../models/Service");
const { calculateSellingPrice } = require("../utils/priceCalculator");


// ✅ CREATE SERVICE
router.post("/add", async (req,res)=>{
  const {
    serviceId,
    name,
    category,
    providerRate,
    profitMargin,
    min,
    max
  } = req.body;

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

  res.json({ message:"Service created", service });
});


// ✏️ UPDATE SERVICE
router.put("/update/:id", async (req,res)=>{
  const service = await Service.findById(req.params.id);
  if(!service) return res.status(404).json({error:"Not found"});

  Object.assign(service, req.body);

  service.sellingRate = calculateSellingPrice(
    service.providerRate,
    service.profitMargin
  );

  await service.save();

  res.json({ message:"Updated", service });
});


// ❌ DELETE SERVICE
router.delete("/delete/:id", async (req,res)=>{
  await Service.findByIdAndDelete(req.params.id);
  res.json({ message:"Deleted successfully" });
});


// 📦 GET ALL SERVICES (ADMIN)
router.get("/all", async (req,res)=>{
  const services = await Service.find();
  res.json(services);
});

module.exports = router;
