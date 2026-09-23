# Sentinel402

**Stateful authorization for agent payments.** MVP API/SDK, dashboard và bộ benchmark phục vụ nghiên cứu. Lõi thực thi không dùng LLM.

Một agent chỉ nhận token gắn với một intent. Mọi đề xuất đi qua kiểm tra deterministic, reservation nguyên tử, adapter thanh toán và audit log. MVP chạy **sandbox**, không ký giao dịch blockchain và không chuyển tiền thật. Tab **Live LLM agent** gọi model thật qua API tương thích OpenAI; lõi Sentinel vẫn deterministic.

## Chạy ngay

Yêu cầu **Node.js ≥ 22.18**, đã có sẵn trên máy này. Không có dependency bên thứ ba; không cần `npm install`.

```powershell
cd D:\Sentinel402
npm run dev
```

Mở **http://127.0.0.1:4020**. Chế độ demo chỉ bind loopback và cấp control key cho trình duyệt local. Không dùng chế độ này làm dịch vụ public. Dữ liệu lưu tại `data/sentinel.sqlite`; restart không xóa reservation hay lịch sử.

1. **Overview:** chạy Split-payment attack; bốn yêu cầu 4 USDC tranh ngân sách 10 USDC, hai yêu cầu được thực thi.
2. **Intent contracts:** tạo hợp đồng, sao chép token agent một lần; thu hồi khi kết thúc nhiệm vụ.
3. **Payment playground:** thử Allow, Block, Repair và Escalate.
4. **Audit trail:** kiểm tra hash chain, xuất log và kiểm tra giao dịch chưa xác định.
5. **Benchmark lab:** chạy 12 phương pháp, xuất CSV, JSONL và bảng LaTeX.

Để chạy với control key do bạn quản lý:

```powershell
$env:SENTINEL_CONTROL_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm start
```

Nhập key trong console. Server và CLI LLM tự nạp `.env`; biến môi trường của shell được ưu tiên. `.env.example` chỉ là mẫu, không được tự nạp; giữ key thật trong `.env` đã được Git bỏ qua. `HOST` giới hạn loopback, `PORT` mặc định 4020, `SENTINEL_DB` chọn file SQLite. Tách reverse proxy có TLS/authentication nếu làm pilot có truy cập từ xa; upstream phải giữ Host loopback. Đây là MVP **một workspace**, chưa có cô lập tenant hay tài khoản SaaS.

## Agent LLM thật

Đặt `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` trong `.env`. Hỗ trợ `OPENAI_REASONING_EFFORT`, `OPENAI_MAX_TOKENS` (mặc định 2048), `OPENAI_TIMEOUT_MS` (60000). Model và base URL được giữ đúng cấu hình, không tự thay model khi lỗi.

```powershell
npm run dev
# Mở tab Live LLM agent, chọn một intent còn hiệu lực, rồi Run live agent.
npm run demo:llm -- benign
npm run demo:llm -- recipient_injection
npm run benchmark:llm
```

Model nhận task, contract và hóa đơn giả lập dưới dạng tool output; tự quyết định gọi `submit_payment`, rồi nhận quyết định/receipt thật từ Sentinel sandbox. Mỗi lượt mặc định tối đa 3 model call và 4 đề xuất. API provider có thể tính phí. Key chỉ ở server, không gửi vào prompt hoặc frontend. CLI demo dùng DB riêng `data/live-agent.sqlite`; dashboard dùng DB workspace.

`benchmark:llm` chạy **4 phương pháp × 2 tình huống × 1 lần lặp**, tối đa 2 model turn mỗi episode; LLM judge gọi API riêng cho mỗi đề xuất. Kết quả và trace ở `artifacts/llm/` (Git bỏ qua). Đây là pilot có LLM thật trong môi trường giả lập, tách khỏi benchmark policy 900 trajectory. Xem [docs/LLM.md](docs/LLM.md) để biết giới hạn, dữ liệu gửi ra provider và cách tái lập.

## SDK

Tạo intent trong dashboard hoặc `POST /api/intents` bằng control key. Token trả về chỉ có quyền gọi payment cho intent đó; không thể tạo/sửa hợp đồng hay đọc log của workspace.

```js
import { SentinelClient } from './sdk/client.mjs';

const sentinel = new SentinelClient({
  baseUrl: 'http://127.0.0.1:4020',
  agentToken: process.env.SENTINEL_AGENT_TOKEN,
});

const result = await sentinel.pay({
  intentId: process.env.SENTINEL_INTENT_ID,
  amount: '1.250000',
  recipient: 'merchant:search',
  resource: 'api:search',
  reference: 'invoice-unique-123',
});
console.log(result.decision, result.status, result.reasons);
```

Có thể chạy `npm run demo:agent` sau khi đặt hai biến môi trường trên. Số tiền dùng **chuỗi decimal, tối đa 6 chữ số thập phân**; nội bộ lưu integer micro-USDC. Không nhận số float, tự đổi tỷ giá hay làm tròn. `note` là dữ liệu không đáng tin, không ảnh hưởng quyền. Timestamp thực thi lấy từ server.

## Kiểm thử và thí nghiệm

```powershell
npm run check
npm test
npm run benchmark
node research/run.mjs --seed 403 --repetitions 50 --out artifacts/seed-403
npm run benchmark:systems
npm run research:experiments
npm run research:llm:plan
```

Bộ mặc định: **900 trajectory = 18 nhóm × 50 biến thể**, đánh giá 12 phương pháp trên cùng corpus có seed. Kết quả tại [artifacts/benchmark/results.md](artifacts/benchmark/results.md), [metrics.csv](artifacts/benchmark/metrics.csv), [summary.json](artifacts/benchmark/summary.json), `corpus.jsonl`, `traces.jsonl`, `table.tex`. CSV là dữ liệu thực nghiệm, không phải bảng marketing. Số đo thời gian chỉ bao gồm hàm policy.

6 baseline: Unguarded, Per-transaction cap, Recipient allowlist, Stateless policy, Budget + count ledger, Strict stateful monitor. 5 ablation lần lượt bỏ budget, count, replay, intent binding, frequency. Sentinel402 là phương pháp đầy đủ. Baseline stateful nghiêm ngặt dùng cùng kernel nhưng không repair; đó là đối chứng mạnh về khả năng thực thi policy, **không phải bản tái lập CaMeL/Progent**.

**Không suy ra khả năng chống prompt injection thực tế từ các con số tổng hợp này.** Tập hiện tại kiểm tra structured authorization, không gọi model và không đo tỷ lệ attacker khiến agent tạo đề xuất sai. Repair chiếm 1/5 nhóm benign; vì vậy chênh lệch utility phản ánh thiết kế tập thử. Hướng nghiên cứu, related work và các thí nghiệm còn thiếu nằm trong [docs/PAPER_PLAN.md](docs/PAPER_PLAN.md).

## Cấu trúc

Bộ mở rộng đã thêm multi-seed, paired family bootstrap, sensitivity theo ngân sách/horizon/replay/repair, concurrency/fault matrix, randomized service stress và 18 fixture LLM. Xem [hướng dẫn experiment](docs/EXPERIMENTS.md) và [kết quả offline](artifacts/experiments/results.md). `research:llm:plan` chỉ in kế hoạch; các lệnh LLM thực thi có giới hạn call và checkpoint/resume.

| Đường dẫn | Vai trò |
|---|---|
| `src/domain.mjs` | Chuẩn hóa, intent contract, deterministic evaluator |
| `src/store.mjs` | SQLite/WAL, transaction `BEGIN IMMEDIATE`, audit hash chain |
| `src/service.mjs` | Credential binding, reserve → execute → settle/reconcile |
| `src/adapter.mjs` | Sandbox adapter có idempotency ledger |
| `src/x402.mjs` | Normalizer offline cho offer x402 v2 `exact`, chain/asset pinning |
| `src/server.mjs` | HTTP API, control/agent auth, dashboard |
| `public/` | Giao diện responsive, không cần build |
| `sdk/`, `examples/` | JavaScript SDK và ví dụ tích hợp agent |
| `research/` | Corpus, oracle độc lập, baseline, metric và export |
| `tests/` | Unit, HTTP, recovery và concurrency đa worker |
| `docs/` | Kiến trúc, API, product plan, thiết kế paper |

## Phạm vi đã có và giới hạn

- Hợp đồng immutable, token hash, local/time/state constraints, bốn quyết định, explicit clipping theo resource, revoke.
- Reservation tính vào ngân sách, số lượt, replay và frequency trước khi gọi adapter. Chỉ thành công mới tăng committed spend. Failure chắc chắn giải phóng reservation; timeout/exception giữ `unknown`.
- Lookup receipt idempotent để đối soát; không có endpoint agent tự báo “thành công/thất bại”. Reservation không tự hết hạn sau crash.
- Log hash chain có thể phát hiện sửa nội dung. Phải neo head ngoài DB để phát hiện kẻ tấn công viết lại toàn bộ chuỗi hoặc cắt phần cuối. Chưa tích hợp dịch vụ neo bên ngoài.
- Chưa có settlement thật, wallet signer/KMS, merchant-authenticated invoice, đa tenant, billing, SSO, distributed consensus hoặc chứng minh formal. Gắn nhãn resource không chứng minh được ý nghĩa nội dung hàng hóa.
- Reference hiện là chuỗi do caller cung cấp, chống replay theo `(intent, recipient, reference)`; thay cả reference có thể vượt lớp duplicate detection nhưng vẫn bị budget/count/frequency giới hạn. Invoice thật cần binding từ payment adapter/merchant.
- SQLite của Node 22 còn phát cảnh báo experimental. File store và service phù hợp prototype/single-host pilot; cần đánh giá persistence, HA và security độc lập trước khi kết nối tiền thật.

Đọc [kiến trúc và threat model](docs/ARCHITECTURE.md), [API](docs/API.md), [kế hoạch sản phẩm](docs/PRODUCT.md) và [kế hoạch paper](docs/PAPER_PLAN.md).
