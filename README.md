# QuantDesk — AI-Powered Stock Market Analysis Platform

QuantDesk is a full-stack, intelligent stock market analysis dashboard with real-time stock pricing, Transformer-based ML price forecasting, and an interactive AI financial analyst chat. It uses a premium, modern Liquid Glass UI (glassmorphism design language).

---

## 🚀 Key Features

- **Live Stock Data**: Parallelized fetching of stock metrics using yfinance.
- **ML Price Forecasting**: 14-day future stock price estimates using a Transformer Neural Network. BUY/SELL signals require ensemble agreement, at least 60% directional accuracy across non-overlapping 14-day holdout samples, and at least 8 holdout samples; otherwise the signal is HOLD. The 14D/30D/60D/90D controls change chart history, not the forecast horizon. Forecasts are estimates, not guaranteed outcomes.
- **AI Analyst Chat**: Interactive chat assistant utilizing Anthropic Claude (with Groq LLM fallback) for custom stock queries.
- **Unified Server Orchestrator**: Runs the Flask application and routes (Stock data, AI Chat, Auth, and ML models) on a single port (5000) while serving the compiled React frontend static bundle.
- **Cloudflare Tunnel Sharing**: Built-in option (`--share`) to bypass firewalls and make the app instantly accessible globally on mobile or other devices.
- **User Authentication**: Admin access is configured through environment secrets; regular users register themselves. Passwords use bcrypt and sessions use JWT, with optional MongoDB persistence.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React.js, Recharts, CSS (Liquid Glass UI) |
| **Backend** | Python, Flask, Flask-CORS, Flask-Caching |
| **Data Sources** | yfinance API |
| **ML Engine** | PyTorch / NumPy (Transformer Forecasting Model) |
| **AI LLM** | Anthropic Claude API / Groq Developer API (LLaMA fallback) |
| **Database & Auth** | MongoDB Atlas, PyMongo, JWT Sessions |
| **Tunnelling & Proxy** | Cloudflare Tunnel (`cloudflared`) |

---

## 📂 Project Structure

```text
quantdesk/
├── backend/
│   ├── server.py             ← Main Stocks API
│   ├── agent_server.py       ← AI chat & LLM handler
│   ├── auth_server.py        ← User auth endpoints
│   ├── ml_server.py          ← ML forecasting endpoints
│   ├── shared_app.py         ← Shared Flask app & static React router
│   └── auth_middleware.py    ← JWT auth helper
├── ml-backend/
│   └── Test.js               ← Backtest helper scripts
├── frontend/
│   ├── src/
│   │   ├── App.js            ← Main Dashboard UI
│   │   ├── Login.js          ← Authentication UI
│   │   └── components/       ← UI and Shared Components
│   └── build/                ← Compiled frontend static assets
├── run_unified.py            ← Unified server orchestrator & sharing script
├── render.yaml               ← Render Blueprint setup
└── wsgi.py                   ← Production WSGI Entrypoint
```

---

## 💻 Quick Start (Local Development)

### 1. Setup Environment
Clone the repository and create your `.env` configuration file in the project root:
```bash
git clone https://github.com/Febun007/QUANTDESK_FINAL.git
cd QUANTDESK_FINAL
```
Create a `.env` file in the root directory and add your credentials:
```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/quantdesk
JWT_SECRET=<random secret of at least 32 characters>
ADMIN_PASSWORD=<at least 12 characters>
ANTHROPIC_API_KEY=your_anthropic_api_key
GROQ_API_KEY=your_groq_api_key
```

### 2. Run the Unified Application (Recommended)
You can run the entire app (including APIs, ML models, and the frontend React bundle) using a single command:

```bash
# Run locally on http://localhost:5000
python run_unified.py

# Run and automatically share globally via secure Cloudflare Tunnel:
python run_unified.py --share
```
*Note: Make sure you compile the React production build (`npm run build` in the `frontend` folder) before running the unified server so that Flask can serve it.*

### 3. Run Frontend in Development Mode (Optional)
If you are modifying frontend code and want hot-reloads, you can run the React dev server:
```bash
cd frontend
npm install
npm start
```
Go to `http://localhost:3000` to interact with the application.

---

## ☁️ Deployment (Render)

QuantDesk is fully compatible with Render's web hosting. The repository includes a `render.yaml` blueprint.

1. Connect your repository to **Render**.
2. Deploy using the `render.yaml` configuration.
3. Configure `JWT_SECRET` (random, at least 32 characters) and `ADMIN_PASSWORD` (at least 12 characters) in the Render dashboard. The admin email defaults to `admin@quantdesk.com`; regular users create their own accounts through registration. Set `MONGO_URI` to persist registered accounts across restarts. Without MongoDB, accounts are stored in memory and will be lost when the service restarts. The app refuses to start with missing or weak auth secrets and does not provide default login passwords.

---

## 📜 License
MIT — Built for BCA Final Year Project