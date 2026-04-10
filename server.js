if (user.balance < cost) {
  return res.status(400).json({ error: "Insufficient balance" });
}

try {
  // 🔥 Send order to SMM API
  const response = await smmRequest.createOrder(
    serviceId,
    link,
    quantity
  );

  // ❌ If API failed
  if (!response || !response.order) {
    console.error("SMM API ERROR:", response);
    return res.status(500).json({
      error: "Failed to place order with provider",
      details: response
    });
  }

  // 💰 Deduct balance AFTER success
  user.balance -= cost;
  await user.save();

  // 📦 Save order in DB
  const order = await Order.create({
    userId: user._id,
    service: service.name,
    link,
    quantity,
    smmOrderId: response.order,
    cost,
    status: "Pending"
  });

  res.json({
    message: "Order placed successfully",
    order,
    balance: user.balance
  });

} catch (err) {
  console.error("ORDER ERROR:", err.message);

  res.status(500).json({
    error: "Order failed",
    details: err.message
  });
}
