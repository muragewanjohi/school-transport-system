"use client";

import React, { useState, useEffect } from "react";
import { 
  CreditCard, 
  Box, 
  AlertTriangle, 
  CheckCircle, 
  Download, 
  HelpCircle, 
  ArrowUpRight, 
  Mail, 
  Phone, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  X,
  Smartphone,
  ShieldCheck,
  Lock,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";

// Type definitions
interface InvoiceHistoryItem {
  id: string;
  period: string;
  flatFee: number;
  smsCount: number;
  totalAmount: number;
  status: "Paid" | "Overdue";
  dueDate: string;
}

export default function BillingConsole() {
  const { profile } = useAuth();
  const canManageBilling = profile?.admin_role === "Super Admin" || 
                           profile?.admin_role === "Operations Admin" || 
                           profile?.admin_role === "Bursar";

  // Billing status state (mocking local database/Supabase state, persists in localStorage)
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentTab, setPaymentTab] = useState<"mpesa" | "card">("mpesa");
  
  // Form states
  const [mpesaPhone, setMpesaPhone] = useState<string>("+254 712 345 678");
  const [cardName, setCardName] = useState<string>("Sarah Jenkins");
  const [cardNumber, setCardNumber] = useState<string>("4000 1234 5678 9010");
  const [cardExpiry, setCardExpiry] = useState<string>("09/29");
  const [cardCvv, setCardCvv] = useState<string>("382");
  
  // Payment processing animation state
  const [paymentStep, setPaymentStep] = useState<"idle" | "processing" | "success">("idle");

  // Load state from API on mount
  useEffect(() => {
    const fetchBillingStatus = async () => {
      try {
        const res = await fetch("/api/billing");
        const json = await res.json();
        if (json.success && json.data) {
          setIsPaid(json.data.is_paid);
          localStorage.setItem("safaricom_billing_paid", json.data.is_paid ? "true" : "false");
        } else {
          const savedStatus = localStorage.getItem("safaricom_billing_paid");
          setIsPaid(savedStatus === "true");
        }
      } catch (err) {
        console.warn("Failed to load billing status from API, falling back to local storage:", err);
        const savedStatus = localStorage.getItem("safaricom_billing_paid");
        setIsPaid(savedStatus === "true");
      } finally {
        setLoading(false);
      }
    };
    fetchBillingStatus();
  }, []);

  // Set billing status helper
  const handlePaymentSuccess = async () => {
    setPaymentStep("processing");
    try {
      await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: true }),
      });
      
      // Simulate transaction delay
      setTimeout(() => {
        setPaymentStep("success");
        setTimeout(() => {
          setIsPaid(true);
          localStorage.setItem("safaricom_billing_paid", "true");
          setShowPaymentModal(false);
          setPaymentStep("idle");
        }, 1500);
      }, 2000);
    } catch (err) {
      console.error("Failed to persist payment status:", err);
      setTimeout(() => {
        setPaymentStep("success");
        setTimeout(() => {
          setIsPaid(true);
          localStorage.setItem("safaricom_billing_paid", "true");
          setShowPaymentModal(false);
          setPaymentStep("idle");
        }, 1500);
      }, 2000);
    }
  };

  // Reset subscription back to overdue for testing/demo purposes
  const handleResetBilling = async () => {
    setIsPaid(false);
    localStorage.removeItem("safaricom_billing_paid");
    try {
      await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: false }),
      });
    } catch (err) {
      console.warn("Failed to reset billing status on API:", err);
    }
  };

  // Raw client-side PDF builder helper
  const handleDownloadInvoice = (item: InvoiceHistoryItem | any) => {
    const text = [
      `%PDF-1.4`,
      `1 0 obj`,
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `endobj`,
      `2 0 obj`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
      `endobj`,
      `3 0 obj`,
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>`,
      `endobj`,
      `4 0 obj`
    ];

    const total = item.flatFee + item.smsCount * 1.00;
    const streamText = [
      `BT`,
      `/F1 18 Tf`,
      `50 720 Td`,
      `(SAFARICOM SCHOOL TRANSPORT SYSTEM - INVOICE RECEIPT) Tj`,
      `0 -40 Td`,
      `/F1 12 Tf`,
      `(Invoice Reference: ${item.id}) Tj`,
      `0 -20 Td`,
      `(Billing Period: ${item.period}) Tj`,
      `0 -20 Td`,
      `(Issued To: Safaricom School Transport Admin Command Center) Tj`,
      `0 -20 Td`,
      `(Payment Status: ${item.status.toUpperCase()}) Tj`,
      `0 -20 Td`,
      `(Due Date: ${item.dueDate}) Tj`,
      `0 -40 Td`,
      `/F1 14 Tf`,
      `(Line Item Charges Breakdown:) Tj`,
      `0 -25 Td`,
      `/F1 12 Tf`,
      `(1. Platform Flat Fee Subscription: KES ${item.flatFee.toLocaleString()}) Tj`,
      `0 -20 Td`,
      `(2. Short Message Service (SMS) Fee: KES ${(item.smsCount * 1.00).toLocaleString()}) Tj`,
      `0 -15 Td`,
      `(   [Volume: ${item.smsCount.toLocaleString()} SMS Sent @ KES 1.00 per SMS]) Tj`,
      `0 -45 Td`,
      `/F1 16 Tf`,
      `(Total Invoice Due: KES ${total.toLocaleString()}) Tj`,
      `0 -60 Td`,
      `/F1 10 Tf`,
      `(Thank you for subscribing to Safaricom School Transport Services.) Tj`,
      `0 -15 Td`,
      `(For billing adjustments or queries, please contact billing-support@safaricom.co.ke) Tj`,
      `ET`
    ].join('\n');

    const streamLength = streamText.length;
    text.push(`<< /Length ${streamLength} >>`);
    text.push(`stream`);
    text.push(streamText);
    text.push(`endstream`);
    text.push(`endobj`);

    // Calculate byte offsets for cross-references
    let offset = 0;
    const offsets = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i].startsWith('%PDF')) {
        offsets.push(0);
      } else if (text[i] === '1 0 obj') {
        offsets.push(offset);
      } else if (text[i] === '2 0 obj') {
        offsets.push(offset);
      } else if (text[i] === '3 0 obj') {
        offsets.push(offset);
      } else if (text[i] === '4 0 obj') {
        offsets.push(offset);
      }
      offset += text[i].length + 1; // +1 for the newline
    }

    const xrefStart = offset;
    text.push(`xref`);
    text.push(`0 5`);
    text.push(`0000000000 65535 f `);
    text.push(String(offsets[1]).padStart(10, '0') + ` 00000 n `);
    text.push(String(offsets[2]).padStart(10, '0') + ` 00000 n `);
    text.push(String(offsets[3]).padStart(10, '0') + ` 00000 n `);
    text.push(String(offsets[4]).padStart(10, '0') + ` 00000 n `);
    text.push(`trailer`);
    text.push(`<< /Size 5 /Root 1 0 R >>`);
    text.push(`startxref`);
    text.push(`${xrefStart}`);
    text.push(`%%EOF`);

    const pdfString = text.join('\n');
    const bytes = new Uint8Array(pdfString.length);
    for (let i = 0; i < pdfString.length; i++) {
      bytes[i] = pdfString.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Safaricom_Transport_Invoice_${item.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Mock billing history data
  const invoiceHistory: InvoiceHistoryItem[] = [
    { id: "INV-2026-005", period: "May 2026", flatFee: 10000, smsCount: 14500, totalAmount: 24500, status: "Paid", dueDate: "May 31, 2026" },
    { id: "INV-2026-004", period: "April 2026", flatFee: 10000, smsCount: 12200, totalAmount: 22200, status: "Paid", dueDate: "April 30, 2026" },
    { id: "INV-2026-003", period: "March 2026", flatFee: 10000, smsCount: 11800, totalAmount: 21800, status: "Paid", dueDate: "March 31, 2026" },
    { id: "INV-2026-002", period: "February 2026", flatFee: 10000, smsCount: 9500, totalAmount: 19500, status: "Paid", dueDate: "February 28, 2026" },
  ];

  return (
    <div className="app-container">
      <Sidebar />

      {loading ? (
        <main className="main-content" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "calc(100vh - 100px)" }}>
          <div className="spinner" />
        </main>
      ) : (
        <>

      <style jsx global>{`
        /* Local Billing Styles */
        .billing-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-lg);
          padding: 0 var(--spacing-lg) var(--spacing-lg) var(--spacing-lg);
        }

        @media (max-width: 1100px) {
          .billing-layout {
            grid-template-columns: 1fr;
          }
        }

        /* Mockup Plan Card Style */
        .mockup-plan-card {
          background: #111625;
          border: 1px solid var(--border-default);
          border-radius: 14px;
          padding: 24px;
          color: #f1f5f9;
          font-family: var(--font-sans), system-ui, sans-serif;
          box-shadow: var(--shadow-md);
        }

        .mockup-header {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #94a3b8;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 20px;
        }

        .mockup-plan-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
        }

        .mockup-plan-title {
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffffff;
        }

        .mockup-active-badge {
          background: #e0e7ff;
          color: #4f46e5;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);
        }

        .mockup-price-details {
          font-size: 1rem;
          color: #f8fafc;
          font-weight: 500;
          margin-bottom: 12px;
        }

        .mockup-alert-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          font-weight: 500;
          margin-bottom: 20px;
        }

        .mockup-alert-row.overdue {
          color: #f59e0b; /* Amber alert matching image */
        }

        .mockup-alert-row.paid {
          color: var(--accent-primary);
        }

        .mockup-divider {
          height: 1px;
          background: rgba(30, 41, 59, 0.6);
          margin: 18px 0;
        }

        .mockup-metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          font-size: 0.9rem;
        }

        .mockup-metric-label {
          color: #94a3b8;
          font-weight: 500;
        }

        .mockup-metric-value {
          color: #ffffff;
          font-weight: 700;
        }

        .mockup-sms-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 0.9rem;
        }

        .mockup-sms-title {
          font-weight: 600;
          color: #ffffff;
        }

        .mockup-sms-value {
          font-weight: 700;
          color: #ffffff;
        }

        .mockup-progress-bg {
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .mockup-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #4f46e5); /* Purple/Indigo fill */
          border-radius: 4px;
        }

        .mockup-sms-subtext {
          font-size: 0.78rem;
          color: #64748b;
          font-weight: 500;
        }

        /* Invoice Summary Card */
        .invoice-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .invoice-breakdown {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 15px;
          margin-bottom: 25px;
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          padding-bottom: 8px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.03);
        }

        .breakdown-row.total {
          border-top: 1px solid var(--border-default);
          border-bottom: none;
          padding-top: 14px;
          font-weight: 700;
          font-size: 1.15rem;
          color: #ffffff;
        }

        .badge-status {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          border: 1px solid transparent;
        }

        .badge-status.overdue {
          background: rgba(244, 63, 94, 0.15);
          color: var(--state-error);
          border-color: rgba(244, 63, 94, 0.3);
          animation: badge-pulse 2s infinite ease-in-out;
        }

        .badge-status.paid {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-primary);
          border-color: rgba(16, 185, 129, 0.3);
        }

        @keyframes badge-pulse {
          0% { opacity: 0.7; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }

        .pay-now-btn {
          background: linear-gradient(135deg, var(--accent-primary) 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 20px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .pay-now-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
          background: linear-gradient(135deg, #10c98e 0%, #04825a 100%);
        }

        /* SMS Analytics Bar Chart */
        .chart-container {
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          height: 180px;
          padding: var(--spacing-md) 0;
          border-bottom: 1px solid var(--border-default);
          margin-bottom: var(--spacing-md);
        }

        .chart-bar-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
          width: 80px;
        }

        .chart-bar-wrapper {
          height: 120px;
          width: 32px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          position: relative;
          display: flex;
          align-items: flex-end;
        }

        .chart-bar-fill {
          width: 100%;
          border-radius: 4px;
          transition: height 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .chart-bar-fill.may {
          background: linear-gradient(to top, rgba(99, 102, 241, 0.4), var(--accent-secondary));
          height: 90px; /* representing 14,500 */
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
        }

        .chart-bar-fill.june {
          background: linear-gradient(to top, rgba(16, 185, 129, 0.4), var(--accent-primary));
          height: 100px; /* representing 16,000 */
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }

        .chart-bar-value {
          position: absolute;
          top: -24px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.75rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .chart-bar-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        /* Payment Gateway Modal */
        .gateway-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(4, 6, 12, 0.85);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .gateway-modal {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 16px;
          width: 460px;
          max-width: 95%;
          overflow: hidden;
          box-shadow: var(--shadow-xl);
          animation: modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modal-enter {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .gateway-header {
          background: rgba(255, 255, 255, 0.01);
          border-bottom: 1px solid var(--border-default);
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .gateway-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid var(--border-default);
        }

        .gateway-tab {
          padding: 14px;
          text-align: center;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
          border: none;
        }

        .gateway-tab.active {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 2px solid var(--accent-primary);
        }

        .gateway-body {
          padding: 24px;
        }

        .payment-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }

        .payment-form-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .payment-form-input {
          background: rgba(6, 9, 19, 0.6);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .payment-form-input:focus {
          border-color: var(--accent-primary);
        }

        .pay-submit-btn {
          width: 100%;
          background: var(--accent-primary);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          margin-top: 10px;
        }

        .pay-submit-btn:hover {
          background: #0d9668;
        }

        .history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }

        .history-table th {
          text-align: left;
          padding: 12px var(--spacing-md);
          border-bottom: 1px solid var(--border-default);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .history-table td {
          padding: 12px var(--spacing-md);
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
          vertical-align: middle;
        }

        .btn-download {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--accent-secondary);
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .btn-download:hover {
          background: rgba(99, 102, 241, 0.2);
          color: #ffffff;
        }

        /* Spinner for loading state */
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top-color: var(--accent-primary);
          animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .processing-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 0;
          gap: 16px;
        }
      `}</style>

      <main className="main-content">
        {/* Top Bar Header */}
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Billing & Subscription Console</span>
            <span style={{ 
              marginLeft: "12px", 
              background: "rgba(16,185,129,0.1)", 
              color: "var(--accent-primary)", 
              padding: "3px 8px", 
              borderRadius: "4px", 
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid rgba(16,185,129,0.2)"
            }}>
              Bursar Billing Console
            </span>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <UserProfileBadge />
            {/* Quick reset button for demonstration */}
            {isPaid && canManageBilling && (
              <button 
                onClick={handleResetBilling}
                title="Reset Billing Status to Overdue (Demo mode)"
                style={{
                  background: "rgba(244,63,94,0.1)",
                  border: "1px solid rgba(244,63,94,0.2)",
                  color: "var(--state-error)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  cursor: "pointer"
                }}
              >
                Reset Billing
              </button>
            )}
          </div>
        </header>

        {/* Content Layout Grid */}
        <section className="billing-layout" style={{ marginTop: "24px" }}>
          
          {/* LEFT COLUMN: Current Plan Card (Mockup style) */}
          <div className="mockup-plan-card">
            {/* Header matching image */}
            <div className="mockup-header">
              <Box size={14} style={{ color: "#94a3b8" }} />
              <span>Current plan</span>
            </div>

            {/* Plan Tier with badge */}
            <div className="mockup-plan-title-row">
              <span className="mockup-plan-title">Pro</span>
              <span className="mockup-active-badge">Active</span>
            </div>

            {/* Pricing Details */}
            <div className="mockup-price-details">
              KES 10,000 / month + KES 1 / SMS
            </div>

            {/* Overdue/Paid notification */}
            {!isPaid ? (
              <div className="mockup-alert-row overdue">
                <AlertTriangle size={14} />
                <span>Renewal due — overdue</span>
              </div>
            ) : (
              <div className="mockup-alert-row paid">
                <CheckCircle size={14} />
                <span>Paid — Next renewal July 31, 2026</span>
              </div>
            )}

            <div className="mockup-divider" />

            {/* Roster & Route Stats */}
            <div className="mockup-metric-row">
              <span className="mockup-metric-label">Students enrolled</span>
              <span className="mockup-metric-value">214</span>
            </div>
            
            <div className="mockup-metric-row">
              <span className="mockup-metric-label">Active routes</span>
              <span className="mockup-metric-value">5</span>
            </div>

            <div className="mockup-metric-row">
              <span className="mockup-metric-label">Drivers</span>
              <span className="mockup-metric-value">6</span>
            </div>

            <div className="mockup-divider" />

            {/* SMS Progress indicator */}
            <div className="mockup-sms-title-row">
              <span className="mockup-sms-title">SMS used (June)</span>
              <span className="mockup-sms-value">16,000</span>
            </div>

            <div className="mockup-progress-bg">
              <div className="mockup-progress-fill" style={{ width: "64%" }} />
            </div>

            <div className="mockup-sms-subtext">
              16,000 of ~25,000 expected this month
            </div>
          </div>

          {/* RIGHT COLUMN: Invoice Break-down Card */}
          <div className="panel invoice-card">
            <div>
              <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "12px" }}>
                <span className="panel-title" style={{ fontSize: "1.2rem" }}>
                  <CreditCard size={20} style={{ color: "var(--accent-secondary)" }} />
                  Current Invoice Details
                </span>
                <span className={`badge-status ${isPaid ? "paid" : "overdue"}`}>
                  {isPaid ? "Paid" : "Overdue"}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                Invoice Period: **June 1 - June 30, 2026** &bull; Ref: **INV-2026-006**
              </p>

              <div className="invoice-breakdown">
                <div className="breakdown-row">
                  <span style={{ color: "var(--text-muted)" }}>Pro Platform Flat Fee Subscription</span>
                  <span style={{ fontWeight: 600 }}>KES 10,000</span>
                </div>
                <div className="breakdown-row">
                  <span style={{ color: "var(--text-muted)" }}>SMS Notifications Volume Charges</span>
                  <span style={{ fontWeight: 600 }}>KES 16,000</span>
                </div>
                <div className="breakdown-row" style={{ fontSize: "0.8rem", paddingLeft: "12px", border: "none" }}>
                  <span style={{ color: "var(--text-muted)" }}>&bull; SMS count: 16,000 sent</span>
                  <span style={{ color: "var(--text-muted)" }}>&bull; KES 1.00 / SMS</span>
                </div>
                <div className="breakdown-row total">
                  <span>Total Amount Due</span>
                  <span>KES 26,000</span>
                </div>
              </div>
            </div>

            {!isPaid ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                <button 
                  className="pay-now-btn" 
                  onClick={() => {
                    if (canManageBilling) {
                      setShowPaymentModal(true);
                    }
                  }}
                  disabled={!canManageBilling}
                  style={!canManageBilling ? {
                    opacity: 0.5,
                    cursor: "not-allowed",
                    background: "rgba(255,255,255,0.05)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-default)",
                    boxShadow: "none"
                  } : {}}
                >
                  <CreditCard size={18} />
                  <span>Pay Outstanding Balance Now</span>
                </button>
                {!canManageBilling && (
                  <span style={{ fontSize: "0.75rem", color: "var(--state-error)", textAlign: "center", display: "block" }}>
                    ⚠️ Read-Only: Payment changes require Super Admin, Operations Admin, or Bursar privileges.
                  </span>
                )}
              </div>
            ) : (
              <div style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.2)",
                padding: "16px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "var(--accent-primary)",
                fontSize: "0.9rem"
              }}>
                <CheckCircle size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>Invoice Settled</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Thank you! Your payment of KES 26,000 has been processed successfully.</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* BOTTOM SECTION: SMS Analytics & Invoice History */}
        <section className="billing-layout" style={{ marginTop: "8px" }}>
          
          {/* SMS Analytics Comparison */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <TrendingUp size={18} style={{ color: "var(--accent-primary)" }} />
                SMS Volume Trends
              </span>
              <span style={{
                background: "rgba(244,63,94,0.1)",
                color: "var(--state-error)",
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "12px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}>
                <TrendingUp size={12} />
                +10.3% vs Last Month
              </span>
            </div>
            
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              Bursar anticipation metric: Compare current billing month volume to prepare allocations.
            </p>

            <div className="chart-container">
              <div className="chart-bar-col">
                <div className="chart-bar-wrapper">
                  <div className="chart-bar-fill may">
                    <span className="chart-bar-value">14,500</span>
                  </div>
                </div>
                <span className="chart-bar-label">May</span>
              </div>

              <div className="chart-bar-col">
                <div className="chart-bar-wrapper">
                  <div className="chart-bar-fill june">
                    <span className="chart-bar-value">16,000</span>
                  </div>
                </div>
                <span className="chart-bar-label">June</span>
              </div>
            </div>

            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>June (Current Month Billing):</span>
                <span style={{ color: "#ffffff", fontWeight: 600 }}>16,000 SMS (KES 16,000)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>May (Previous Month Billing):</span>
                <span style={{ color: "#ffffff", fontWeight: 600 }}>14,500 SMS (KES 14,500)</span>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: "8px", marginTop: "4px", fontSize: "0.75rem", fontStyle: "italic" }}>
                * Expecting ~25,000 SMS total this month based on active routes. Predicted SMS charge: KES 25,000.
              </div>
            </div>
          </div>

          {/* Invoice History & Support */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Invoice History Panel */}
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">
                  <Calendar size={18} />
                  Historical Invoices
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Past 4 Cycles</span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Ref ID</th>
                      <th>Month</th>
                      <th>Total Due</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceHistory.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.id}</td>
                        <td style={{ color: "var(--text-muted)" }}>{item.period}</td>
                        <td style={{ fontWeight: 600, color: "#ffffff" }}>KES {item.totalAmount.toLocaleString()}</td>
                        <td>
                          <span className="badge-status paid">Paid</span>
                        </td>
                        <td>
                          <button 
                            className="btn-download"
                            onClick={() => handleDownloadInvoice(item)}
                            title="Download PDF Invoice Receipt"
                          >
                            <Download size={12} />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Support Queries Panel */}
            <div className="panel" style={{ background: "rgba(99, 102, 241, 0.03)", borderColor: "rgba(99, 102, 241, 0.15)" }}>
              <span className="panel-title" style={{ fontSize: "1rem", marginBottom: "8px" }}>
                <HelpCircle size={18} style={{ color: "var(--accent-secondary)" }} />
                Need Assistance with Billing?
              </span>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.4" }}>
                Have questions about SMS counts, rates, or payment systems? Reach out directly to Safaricom support.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <a 
                  href="mailto:billing-support@safaricom.co.ke?subject=School%20Transport%20Billing%20Query%20(Ref:%20Sarah%20Jenkins)"
                  className="btn-download" 
                  style={{ flex: 1, justifyContent: "center", minWidth: "150px" }}
                >
                  <Mail size={14} />
                  <span>Email Support</span>
                </a>
                <a 
                  href="tel:+254700000000" 
                  className="btn-download" 
                  style={{ flex: 1, justifyContent: "center", minWidth: "150px", color: "var(--accent-primary)", background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.2)" }}
                >
                  <Phone size={14} />
                  <span>Call Billing Desk</span>
                </a>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* PAYMENT GATEWAY INTERACTIVE MODAL */}
      {showPaymentModal && (
        <div className="gateway-overlay">
          <div className="gateway-modal">
            {/* Header */}
            <div className="gateway-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontWeight: 700, fontSize: "1rem", color: "#ffffff" }}>Secure Payment Portal</span>
              </div>
              <button 
                onClick={() => setShowPaymentModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Invoice Reference Info */}
            <div style={{ padding: "18px 24px 0 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment Reference</div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#ffffff" }}>INV-2026-006 (June 2026)</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount Payable</div>
                <div style={{ fontWeight: 700, fontSize: "1.2rem", color: "var(--accent-primary)" }}>KES 26,000</div>
              </div>
            </div>

            {/* Mode selection tabs */}
            <div className="gateway-tabs" style={{ marginTop: "16px" }}>
              <button 
                className={`gateway-tab ${paymentTab === "mpesa" ? "active" : ""}`}
                onClick={() => setPaymentTab("mpesa")}
                disabled={paymentStep !== "idle"}
              >
                Lipa na M-Pesa
              </button>
              <button 
                className={`gateway-tab ${paymentTab === "card" ? "active" : ""}`}
                onClick={() => setPaymentTab("card")}
                disabled={paymentStep !== "idle"}
              >
                Credit / Debit Card
              </button>
            </div>

            {/* Gateway form content */}
            <div className="gateway-body">
              {paymentStep === "idle" && (
                <div style={{ animation: "modal-enter 0.2s ease" }}>
                  {paymentTab === "mpesa" ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(16,185,129,0.06)", border: "1px dashed rgba(16,185,129,0.2)", padding: "12px", borderRadius: "6px", marginBottom: "20px" }}>
                        <Smartphone size={24} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                          An STK Push request will be sent to the mobile number below. You will receive a prompt on your phone to enter your M-Pesa PIN.
                        </span>
                      </div>
                      
                      <div className="payment-form-group">
                        <label className="payment-form-label">M-Pesa Mobile Number</label>
                        <input 
                          type="text" 
                          className="payment-form-input" 
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="e.g. +254 712 345 678"
                        />
                      </div>

                      <button className="pay-submit-btn" onClick={handlePaymentSuccess}>
                        <span>Initiate M-Pesa STK Push</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="payment-form-group">
                        <label className="payment-form-label">Cardholder Name</label>
                        <input 
                          type="text" 
                          className="payment-form-input" 
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                        />
                      </div>

                      <div className="payment-form-group">
                        <label className="payment-form-label">Card Number</label>
                        <input 
                          type="text" 
                          className="payment-form-input" 
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div className="payment-form-group">
                          <label className="payment-form-label">Expiry Date</label>
                          <input 
                            type="text" 
                            className="payment-form-input" 
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM/YY"
                          />
                        </div>
                        <div className="payment-form-group">
                          <label className="payment-form-label">CVV / CVC</label>
                          <input 
                            type="password" 
                            className="payment-form-input" 
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            maxLength={3}
                          />
                        </div>
                      </div>

                      <button className="pay-submit-btn" onClick={handlePaymentSuccess} style={{ marginTop: "12px" }}>
                        <Lock size={16} />
                        <span>Pay KES 26,000 Securely</span>
                      </button>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", marginTop: "20px", color: "var(--text-muted)", fontSize: "0.72rem" }}>
                    <ShieldCheck size={14} style={{ color: "var(--accent-primary)" }} />
                    <span>Secured with SSL 256-bit encryption</span>
                  </div>
                </div>
              )}

              {paymentStep === "processing" && (
                <div className="processing-container">
                  <div className="spinner" />
                  <div style={{ fontWeight: 600, color: "#ffffff", fontSize: "1.05rem" }}>
                    {paymentTab === "mpesa" ? "Sending STK Push Prompt..." : "Authorizing Transaction..."}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                    {paymentTab === "mpesa" 
                      ? "Please check your handset for the M-Pesa PIN prompt to authorize." 
                      : "Verifying credentials with Safaricom payment gateway..."}
                  </div>
                </div>
              )}

              {paymentStep === "success" && (
                <div className="processing-container" style={{ animation: "modal-enter 0.2s ease" }}>
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "2px solid var(--accent-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-primary)",
                    boxShadow: "0 0 15px rgba(16, 185, 129, 0.3)"
                  }}>
                    <CheckCircle size={28} />
                  </div>
                  <div style={{ fontWeight: 700, color: "#ffffff", fontSize: "1.1rem" }}>Payment Successful!</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", maxWidth: "280px" }}>
                    Outstanding balance has been settled. Your account is fully active and current.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
