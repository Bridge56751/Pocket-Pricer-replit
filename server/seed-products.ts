import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const products = await stripe.products.search({ query: "name:'Pocket Pricer Pro'" });
  if (products.data.length > 0) {
    console.log('Pocket Pricer Pro already exists:', products.data[0].id);
    const prices = await stripe.prices.list({ product: products.data[0].id, active: true });
    console.log('Price ID:', prices.data[0]?.id);
    return;
  }

  const product = await stripe.products.create({
    name: 'Pocket Pricer Pro',
    description: 'Unlimited product scans and searches for eBay reselling',
    metadata: {
      app: 'pocket-pricer',
      tier: 'pro',
    },
  });

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 499,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: {
      plan: 'monthly',
    },
  });

  console.log('Created product:', product.id);
  console.log('Created price:', monthlyPrice.id);
}

createProducts().catch(console.error);
