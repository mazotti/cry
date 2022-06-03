require('dotenv').config();
const ccxt = require('ccxt');
const axios = require('axios');

const tick = async (config, binanceClient) => {
  const { asset, base, spread, allocation } = config;
  const market = `${asset}/${base}`;

  // Cancel open orders left from previou tick, if any
  const orders = await binanceClient.fetchOpenOrders(market);
  orders.forEach(async order => {
    await binanceClient.cancelOrder(order.id,order.symbol);
  });

  // Fetch current market prices
  const results = await Promise.all([
    axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wbnb&vs_currencies=usd'),
    axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd')
  ]);
  const marketPrice = results[0].data.wbnb.usd / results[1].data.tether.usd;
  const priceNow = results[0].data.wbnb.usd;

  // Calculate new orders parameters
  const vendaSegura = 306;
  const stopLoss = vendaSegura - vendaSegura * 0.05;
  const sellPrice = marketPrice * (1 + spread);
  const buyPrice = marketPrice * (1 - spread);
  const balances = await binanceClient.fetchBalance({'recvWindow': 60000});
  const assetBalance = balances.free[asset]; // e.g. 0.01 BTC
  const baseBalance = balances.free[base]; // e.g. 20 USDT
  const sellVolume = assetBalance * allocation;
  const buyVolume = (baseBalance * allocation) / marketPrice;
  let msgStatus = '';
  //Send orders

  if ((baseBalance * allocation) >= 10 && (assetBalance * allocation) >= 0.1 && priceNow >= vendaSegura) {
    await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);
    
    msgStatus = 'Ambos';
  }if ((baseBalance * allocation) >= 10 && (assetBalance * allocation) < 0.1) {
    await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);
    msgStatus = 'Compando';
  }if ((baseBalance * allocation) < 10 && (assetBalance * allocation) >= 0.1 && priceNow >= vendaSegura) {
    await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    msgStatus = 'Vendendo';
  } 


  console.log(`
    New tick for ${market}... @ ${priceNow}
    Created limit sell order for ${sellVolume}@${sellPrice}  
    Created limit buy order for ${buyVolume}@${buyPrice}  
    Status... ${msgStatus}
    StopLoss... ${stopLoss}
  `);
};

const run = () => {
  const config = { 
    asset: "BNB",
    base: "USDT",
    allocation: 0.2,     // Percentage of our available funds that we trade
    spread: 0.02,         // Percentage above and below market prices for sell and buy orders 
    tickInterval: 5000  // Duration between each tick, in milliseconds
  };
  const binanceClient = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    options: { adjustForTimeDifference: true }
  });
  tick(config, binanceClient);
  setInterval(tick, config.tickInterval, config, binanceClient);
};

run();