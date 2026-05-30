# GoldFlow - Jewelry Management System
## Detailed Project Documentation

### 1. Executive Summary
GoldFlow is a high-fidelity, professional Jewelry Management application designed to streamline daily operations for jewelry businesses. It features a comprehensive dashboard with financial analytics, complex transaction management, and a robust asset tracking system.

---

### 2. Core Modules

#### A. Dashboard & Analytics
- **Financial Charts**: Interactive AreaCharts for Cash Flow, Gold Sold, and Silver Sold.
- **Time-Range Filters**: Dynamic data updates for 14D, 1M, 1Y, 2Y, and 5Y ranges.
- **Transaction Ledgers**: Detailed Inflow and Outflow tracking with status indicators.
- **Activity Feed**: Real-time monitoring of recent business actions and debtor statuses.

#### B. Customer Trans (Transaction) Module
The heart of the application, featuring a multi-level tabbed interface:
- **Billing**: Itemized sales with support for Tag-based searching, labor calculations, and GST.
- **Receipts**: Payment management with fixed today's date and multiple payment modes (Cash/Bank/UPI).
- **Charges**: Service-based entries for making charges, repairs, and other custom services.
- **Return**: Streamlined customer return processing with reason tracking.
- **Conversion**: Specialized tool for asset-to-asset conversions (e.g., Old Gold to Pure Gold).

#### C. Asset Balances & Tracking
- Real-time tracking of three primary assets: **Cash**, **Gold**, and **Silver**.
- Dynamic calculation of "Current", "Change", and "Final" balances per transaction.
- Visual status dots with glow effects for immediate asset identification.

---

### 3. Key UI/UX Features

- **Pixel-Perfect Alignment**: Tables use a synchronized padding system (0.75rem) to ensure headers and values align perfectly on the same vertical line.
- **High-Fidelity Design**: Professional typography, subtle animations (fadeIn), and backdrop-blur effects on fixed components.
- **Dynamic Interactions**: 
    - **Add/Remove Rows**: Instant dynamic row management across all transaction categories.
    - **Borderless Data Entry**: Spreadsheet-like interface for rapid, distraction-free typing.
- **Responsive & Device Friendly**: 
    - Mobile-first approach with a slide-in drawer menu.
    - Collapsible sidebar for desktop efficiency.
    - Adaptive grids (4-column to 2-column) based on screen width.
- **Dark Mode System**: Robust theme switching using CSS variables, ensuring full visibility and professional aesthetics in both light and dark environments.

---

### 4. Technical Architecture

- **Frontend**: React.js with Functional Components and Hooks (`useState`, `useMemo`).
- **Icons**: Lucide-React for a modern, consistent icon set.
- **Charts**: Recharts for high-performance interactive data visualization.
- **Styling**: Advanced CSS3 with Flexbox, Grid, and Custom Properties (Variables) for theming.
- **State Management**: Deterministic mock data generation based on date components to simulate a live database environment.

---

### 5. Implementation Status
- [x] High-fidelity Dashboard with charts.
- [x] Multi-tab Transaction Module.
- [x] Dynamic Table Row Logic.
- [x] Dark/Light Theme System.
- [x] Responsive Sidebar/Navbar.
- [x] Professional Column Alignment.
- [ ] Backend Integration (Planned).
- [ ] Export to PDF/Excel (Planned).
