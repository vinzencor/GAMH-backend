# GAMH-Backend

Node.js / Express / MongoDB backend for **Global Research Gateway Hub**.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 4 |
| Database | MongoDB via Mongoose |
| Auth | JWT (access + refresh tokens) |
| File Uploads | Multer + AWS S3 |
| Security | Helmet, CORS, express-rate-limit |

---

## Folder Structure

```
GAMH-Backend/
├── server.js              # Entry point
├── .env                   # Environment variables (do NOT commit)
├── .env.example           # Template
├── uploads/               # Optional local folder (legacy)
└── src/
    ├── app.js             # Express app config, routes registration
    ├── config/
    │   ├── db.js          # MongoDB connection
    │   └── constants.js   # Enums, role names, module keys
    ├── models/            # Mongoose schemas
    │   ├── User.js
    │   ├── RoleModuleAccess.js
    │   ├── ContentItem.js
    │   ├── JournalSubmission.js
    │   ├── WorkflowTemplate.js
    │   ├── WorkflowStage.js
    │   ├── WorkflowLog.js
    │   ├── Review.js
    │   ├── ReviewDecision.js
    │   ├── MembershipPlan.js
    │   ├── Membership.js
    │   ├── Invoice.js
    │   ├── PayPerViewPurchase.js
    │   ├── LibraryItem.js
    │   ├── SavedLibraryItem.js
    │   ├── FeaturedUser.js
    │   └── SubAdminScore.js
    ├── controllers/       # Business logic
    │   ├── auth.controller.js
    │   ├── user.controller.js
    │   ├── content.controller.js
    │   ├── journal.controller.js
    │   ├── workflow.controller.js
    │   ├── review.controller.js
    │   ├── membership.controller.js
    │   ├── library.controller.js
    │   ├── featured.controller.js
    │   └── admin.controller.js
    ├── routes/            # Express routers
    │   ├── auth.routes.js
    │   ├── user.routes.js
    │   ├── content.routes.js
    │   ├── journal.routes.js
    │   ├── workflow.routes.js
    │   ├── review.routes.js
    │   ├── membership.routes.js
    │   ├── library.routes.js
    │   ├── featured.routes.js
    │   └── admin.routes.js
    ├── middleware/
    │   ├── auth.middleware.js   # JWT protect / optionalAuth
    │   ├── role.middleware.js   # requireRoles / requireModule
    │   └── error.middleware.js  # Global error handler
    └── utils/
        ├── jwt.js              # Sign / verify tokens
        ├── membership.js       # Status reconciliation
        ├── upload.js           # Multer + S3 upload config
        ├── helpers.js          # catchAsync, sendSuccess, createError
        └── seed.js             # Database seed script
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Seed the database (creates admin user, plans, workflow)
npm run seed

# 4. Start in development mode
npm run dev

# 5. Start in production
npm start
```

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Login (returns accessToken + refreshToken) |
| POST | `/refresh` | Get new access token via refresh token |
| GET | `/me` | Get current authenticated user |
| PATCH | `/change-password` | Change password |

### Users — `/api/users`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me` | ✅ | Own profile |
| PATCH | `/me` | ✅ | Update own profile |
| GET | `/:id` | — | Public profile |
| GET | `/` | admin | List all users |
| PATCH | `/:userId/roles` | super_admin | Set user roles |
| POST | `/:userId/roles/add` | super_admin | Add role |
| POST | `/:userId/roles/remove` | super_admin | Remove role |
| PATCH | `/:userId/toggle-active` | super_admin | Activate/deactivate |
| GET | `/admin/role-module-access` | super_admin | List module access |
| POST | `/admin/role-module-access` | super_admin | Set module access |

### Content — `/api/content`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/published` | optional | Published papers (filters: type, access, search) |
| GET | `/homepage` | — | Featured homepage content |
| GET | `/slug/:slug` | optional | Single publication by slug |
| GET | `/my-submissions` | ✅ | Author's own submissions |
| POST | `/` | ✅ | Create/save draft |
| PATCH | `/:id/submit` | ✅ | Submit paper for review |
| PATCH | `/:id` | ✅ | Update content |
| GET | `/admin/all` | admin | All content (admin view) |
| DELETE | `/:id` | admin | Delete content |

### Journals — `/api/journals`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/published` | optional | Published journals |
| GET | `/slug/:slug` | optional | Single published journal by slug |
| GET | `/my-submissions` | ✅ | My journal submissions |
| POST | `/` | ✅ | Create journal draft (supports file upload) |
| POST | `/submit` | ✅ | Directly submit journal (requires manuscript file) |
| PATCH | `/:id` | ✅ | Update draft/submission (supports file upload) |
| PATCH | `/:id/submit` | ✅ | Submit existing draft for review |
| GET | `/admin/all` | admin | List all journals |
| DELETE | `/:id` | admin | Delete journal |

Journal upload fields (multipart/form-data):
- `manuscript` (PDF/DOC/DOCX)
- `supplementary` (optional attachment)
- `coverImage` (optional image)
- `keywords` can be JSON array or comma-separated string
- `coAuthors` can be JSON array or comma-separated string

### Workflow — `/api/workflow`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/templates` | admin | List workflow templates |
| POST | `/templates` | admin | Create template |
| PATCH | `/templates/:id` | admin | Update template |
| DELETE | `/templates/:id` | super_admin | Delete template |
| GET | `/templates/:templateId/stages` | ✅ | Get stages |
| PUT | `/templates/:templateId/stages` | admin | Replace all stages |
| GET | `/my-queue` | sub_admin | Assigned review queue |
| POST | `/content/:contentId/action` | sub_admin | Approve/reject/request changes |
| GET | `/content/:contentId/logs` | ✅ | Workflow action logs |
| GET | `/my-score` | sub_admin | Gamification score |

### Reviews — `/api/reviews`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/my-reviews` | reviewer | My assigned reviews |
| PATCH | `/:id/accept` | reviewer | Accept assignment |
| PATCH | `/:id/decline` | reviewer | Decline assignment |
| PATCH | `/:id/submit` | reviewer | Submit review |
| GET | `/` | admin | All reviews |
| POST | `/assign` | admin | Assign reviewer |
| POST | `/decision` | admin | Record editorial decision |

### Memberships — `/api/memberships`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plans` | — | Active plans list |
| POST | `/plans` | admin | Create plan |
| PATCH | `/plans/:id` | admin | Update plan |
| DELETE | `/plans/:id` | super_admin | Deactivate plan |
| GET | `/my` | ✅ | Own membership |
| POST | `/apply` | ✅ | Apply (upload screenshot) |
| POST | `/cancel` | ✅ | Cancel membership |
| GET | `/all` | admin | All memberships |
| PATCH | `/:membershipId/approve` | admin | Approve/reject |
| PATCH | `/:membershipId/renew` | admin | Renew |
| GET | `/invoices/my` | ✅ | Own invoices |
| GET | `/invoices/all` | admin | All invoices |
| GET | `/ppv/check/:contentId` | ✅ | Check PPV access |
| POST | `/ppv/purchase` | ✅ | Purchase PPV |

### Library — `/api/library`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | optional | Browse library |
| GET | `/saved` | ✅ | My saved items |
| POST | `/save/:itemId` | ✅ | Save item |
| DELETE | `/save/:itemId` | ✅ | Unsave item |
| GET | `/my-submissions` | ✅ | My digital library submissions |
| POST | `/draft` | ✅ | Create digital library draft (PDF optional) |
| POST | `/submit` | ✅ | Submit digital library item (PDF required) |
| PATCH | `/:id/submit` | ✅ | Submit existing draft for review |
| POST | `/` | admin | Add library item (PDF upload) |
| PATCH | `/:id` | admin | Update item |
| DELETE | `/:id` | admin | Delete item |
| GET | `/admin/all` | admin | List all library items |
| PATCH | `/admin/:id/review` | admin | Approve/reject/request changes |

Digital library upload fields (multipart/form-data):
- `pdf` (required for direct submit)
- `authorsJson` as JSON array, e.g. `[{"name":"A","institution":"B"}]`
- Admin review body: `action` = `approve` | `reject` | `request_changes`, optional `note`

### Featured Users — `/api/featured`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | Public featured users list |
| POST | `/request` | ✅ | Request to be featured |
| GET | `/my-requests` | ✅ | Own requests |
| GET | `/admin/all` | admin | All featured users |
| GET | `/admin/requests` | admin | All requests |
| PATCH | `/admin/requests/:requestId/review` | admin | Approve/reject request |
| DELETE | `/admin/:userId` | admin | Remove from featured |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/analytics` | admin | Platform stats |
| GET | `/pipeline` | admin | Submission pipeline counts |
| GET | `/sub-admins/leaderboard` | admin | Sub-admin scores |
| GET | `/sub-admins/users` | admin | Sub-admin assignments |

---

## Default Credentials (after seed)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@gamh.com | Admin@1234 |

> **Change the password immediately after first login.**

---

## Environment Variables

| Key | Description |
|-----|-------------|
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | development / production |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Access token signing secret |
| `JWT_EXPIRES_IN` | Access token expiry (e.g. 7d) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (e.g. 30d) |
| `UPLOAD_DIR` | Local upload folder (default: uploads) |
| `MAX_FILE_SIZE_MB` | Max upload size in MB (default: 10) |
| `CLIENT_ORIGIN` | Frontend origin for CORS |
