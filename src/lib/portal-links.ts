import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Globe,
  GraduationCap,
  Mail,
  MessageCircle,
  User,
} from "lucide-react";

export interface PortalLink {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  icon: LucideIcon;
}

export interface PortalLinkSection {
  id: string;
  title: string;
  links: PortalLink[];
}

export const PORTAL_SECTIONS: PortalLinkSection[] = [
  {
    id: "sales-tools",
    title: "Sales Tools",
    links: [
      {
        id: "leadspply",
        title: "LeadSpply",
        description: "Leads, quotes, and client management.",
        href: "https://leadspply.com/register",
        external: true,
        icon: BarChart3,
      },
      {
        id: "gmail",
        title: "Gmail",
        description: "Your @thepncl.com email inbox.",
        href: "https://mail.google.com",
        external: true,
        icon: Mail,
      },
      {
        id: "carrier-sheet",
        title: "Carrier Sheet",
        description: "Carrier contacts and e-app links.",
        href: "/portal/carriers",
        external: false,
        icon: Building2,
      },
      {
        id: "discord",
        title: "Discord",
        description: "PNCL community server for announcements, training, and support.",
        href: "https://discord.gg/aHqQDtTmp",
        external: true,
        icon: MessageCircle,
      },
    ],
  },
  {
    id: "training",
    title: "Training & Resources",
    links: [
      {
        id: "pinnacle-genesis",
        title: "Pinnacle Genesis",
        description: "Agent training platform and curriculum.",
        href: "https://www.pinnaclegenesis.cc/",
        external: true,
        icon: GraduationCap,
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    links: [
      {
        id: "profile",
        title: "My Profile",
        description: "Update your name, sizes, and profile photo.",
        href: "/portal/profile",
        external: false,
        icon: User,
      },
    ],
  },
  {
    id: "pncl",
    title: "PNCL",
    links: [
      {
        id: "website",
        title: "Company Website",
        description: "Public PNCL site and product pages.",
        href: "/",
        external: false,
        icon: Globe,
      },
    ],
  },
];
