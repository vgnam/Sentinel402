# Chạy Sentinel trên Solana local validator

Local validator tạo một blockchain thử nghiệm trên máy, có RPC và faucet riêng. Theo [tài liệu Agave](https://docs.anza.xyz/cli/examples/test-validator), môi trường này không có quota RPC/airdrop của dịch vụ công khai. Tốc độ, dung lượng ledger và số lần thử vẫn phụ thuộc tài nguyên máy. Các giao dịch local không phải bằng chứng settlement trên devnet/mainnet công khai.

## Chạy ngay trên máy đã chuẩn bị

Đã cài Ubuntu 26.04.1 trong WSL, tài khoản Linux `sentinel402` và Agave 4.3.0 tại `/home/sentinel402/.local/share/sentinel402/solana-release`. Không cần tải/cài lại. Dùng cổng 18999 để tránh tiến trình cũ ở cổng mặc định.

Terminal PowerShell 1:

```powershell
cd D:\Sentinel402
$env:SENTINEL_WSL_USER = 'sentinel402'
npm.cmd run validator:local -- --wsl --rpc-port 18999 --faucet-port 19900
```

Terminal PowerShell 2:

```powershell
cd D:\Sentinel402
npm.cmd run research:local -- --rpc http://127.0.0.1:18999 --repetitions 10
```

Số lần lặp hỗ trợ 1–100 mỗi batch. Chạy thêm batch mới khi cần; đây là giới hạn của runner để tránh chạy nhầm quá nhiều, không phải quota faucet. Dừng validator bằng Ctrl+C ở terminal 1. Nếu chỉ muốn một lần thử, dùng `npm.cmd run demo:local -- --rpc http://127.0.0.1:18999`.

## Chạy khi đã có Solana CLI

Ứng dụng dùng Node.js ≥22.18. Cài SDK tùy chọn một lần ở thư mục repo:

```powershell
npm.cmd --prefix integrations/solana ci --ignore-scripts --no-audit --no-fund
```

Terminal 1, giữ validator chạy:

```powershell
cd D:\Sentinel402
npm.cmd run validator:local
```

Launcher tìm `SOLANA_VALIDATOR_BIN`, sau đó binary trong `.tools/solana-release/bin`, rồi PATH. RPC là `http://127.0.0.1:8899`; ledger mặc định ở `data/local-validator/ledger`. Không tự reset ledger. Dừng bằng Ctrl+C. Trên Linux/macOS, dùng `npm` thay `npm.cmd`.

Terminal 2:

```powershell
# Một lần thử mới, tự xin SOL từ faucet trên máy:
npm.cmd run demo:local

# Ba lần thử độc lập, mỗi lần có ví/mint/contract mới:
npm.cmd run research:local -- --repetitions 3
```

Mỗi lần thử tạo mint test sáu chữ số thập phân với 10 token; chuyển 1 token ở ca bình thường và 1 token ở ca mất response sau broadcast; đối soát receipt; retry cùng transaction để kiểm tra không gửi tiền hai lần; chặn recipient ngoài contract. Cuối cùng kiểm tra payer còn 8 token, merchant nhận 2 token và audit hợp lệ. Token không phải USDC và không có giá trị tiền thật. Phí SOL và account rent nằm ngoài budget token của Sentinel.

Kết quả thành công phải có `status: "passed"`, hai transaction `succeeded`, `idempotentRetry: true`, balance đúng và audit hợp lệ. `status: "incomplete"` hoặc exit code khác 0 không phải bằng chứng thành công. Runner nhiều lần dừng ngay khi có một lần lỗi, giữ nguyên báo cáo để xem nguyên nhân.

## Windows: chạy validator trong Ubuntu/WSL

[Hướng dẫn Solana](https://solana.com/docs/intro/installation) dùng WSL trên Windows. Nếu binary Windows không tạo được ledger, chạy validator trong Linux, còn Node/demo vẫn có thể chạy từ PowerShell.

PowerShell, cài Ubuntu nếu chưa có:

```powershell
wsl --install --distribution Ubuntu --no-launch --web-download
wsl --distribution Ubuntu
```

Nếu Windows yêu cầu restart hoặc thiết lập tài khoản Ubuntu lần đầu, hoàn tất bước đó trước. Trong terminal Ubuntu, cài Solana CLI theo [Anza](https://docs.anza.xyz/cli/install). Ví dụ với phiên bản tài liệu hiện nêu:

```bash
curl -sSfL https://release.anza.xyz/v4.3.0/install -o /tmp/sentinel-solana-install.sh
sh /tmp/sentinel-solana-install.sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-test-validator --version
mkdir -p "$HOME/sentinel402-local-ledger"
solana-test-validator --ledger "$HOME/sentinel402-local-ledger" --bind-address 127.0.0.1 --rpc-port 8899 --limit-ledger-size 10000 --log
```

Giữ ledger trên filesystem Linux của WSL. Không dùng chung ledger với bản Windows hoặc chạy hai validator trên cổng 8899. Không cần cài Anchor/Rust để chạy demo token này nếu binary Solana CLI đã hoạt động.

Sau khi cài CLI, các lần sau có thể khởi động từ PowerShell bằng `npm.cmd run validator:local -- --wsl`. Launcher dùng distro `Ubuntu` và user mặc định; có thể chọn bằng `SENTINEL_WSL_DISTRO` và `SENTINEL_WSL_USER`. Dừng bằng Ctrl+C, không đóng bằng cách kill riêng `wsl.exe` khi validator vẫn đang ghi ledger.

Quay lại PowerShell để kiểm tra localhost trước khi chạy demo:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8899 -Method Post -ContentType application/json -Body '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'
npm.cmd run demo:local
```

`getHealth` cần trả `result: "ok"`. Nếu Windows chưa truy cập được localhost của WSL, cần sửa kết nối localhost forwarding hoặc chạy cả Node và demo bên trong WSL. Adapter local chỉ nhận địa chỉ loopback dạng số; không thay bằng RPC công khai để xử lý lỗi này.

## Chạy lại, resume và reset

Mặc định mỗi `demo:local` sinh run ID mới. Ví/mint/outbox/SQLite riêng ở `data/solana-local/runs/<runId>/`; kết quả công khai ở `artifacts/realism/local/<runId>/summary.json`. Batch có summary riêng cùng thư mục cha. Secret key, DB và binary cài ngoài được Git-ignore; không đưa chúng lên repository.

Để tiếp tục chính lần thử đang dở trên **cùng ledger**, dùng run ID đã in ra:

```powershell
npm.cmd run demo:local -- --run-id RUN_ID_DA_IN
```

Không chạy đồng thời hai process với cùng run ID. Không tạo payment thay thế cho outbox chưa rõ kết quả. Retry sử dụng signed wire/signature đã lưu, và chỉ xác nhận thành công khi receipt khớp đúng token transfer.

Nếu cần một blockchain sạch, dừng validator rồi khởi động với **một thư mục ledger mới**, chẳng hạn `--ledger "$HOME/sentinel402-local-ledger-2"` trong WSL. Chạy `demo:local` không có `--run-id` để tạo lần thử mới. Không tự xóa ledger cũ. Resume với genesis khác bị từ chối; reset không chứng minh một payment cũ đã thất bại.

Local adapter dùng mode `solana-local`, genesis được pin khi bắt đầu và lưu trong SQLite; không chấp nhận genesis của devnet, testnet hoặc mainnet. Receipt local chứa RPC và genesis, không gắn link explorer devnet. `demo:devnet` vẫn khóa vào public devnet và giữ nguyên thư mục `data/devnet`.

## Trạng thái xác minh trên máy này

Ngày 28/09/2026: syntax check và **76/76 test đạt**, gồm kiểm tra local/devnet isolation, loopback-only endpoint, genesis thay đổi sau reset, receipt chính xác, mất response và idempotency. Các test tự động dùng mock RPC.

Bản Windows có sẵn báo `solana-test-validator 4.2.2`, nhưng không tạo được ledger: chế độ mặc định gặp lỗi quyền tạo log symlink, `--log` đi tiếp rồi lỗi `Access is denied` khi kiểm tra giải nén genesis. Lần kiểm tra demo trước khi validator sẵn sàng ghi `SOLANA_RPC_UNREACHABLE`, không có giao dịch; báo cáo chưa hoàn thành đó được giữ nguyên.

Sau khi chuyển sang WSL, đã chạy **3/3 lần thử thành công trên validator thật**, tổng cộng **6 payment transaction** (chưa tính airdrop/setup mint). Mỗi run có ca mất response sau broadcast được reconcile, hai retry không broadcast thêm, merchant nhận đúng 2 test token và audit hợp lệ. Sau restart cùng ledger, resume run đầu vẫn đạt, **0 broadcast mới**, cùng signatures và số dư 8/2 token. [Batch summary](../artifacts/realism/local/batch-2026-09-28T11-58-09-217Z-1ff10a61/summary.json), [run đầu trước restart](../artifacts/realism/local/batch-2026-09-28T11-58-09-217Z-1ff10a61-1/before-resume.json), [sau resume](../artifacts/realism/local/batch-2026-09-28T11-58-09-217Z-1ff10a61-1/summary.json).

Đợt chạy mở rộng trên cùng ledger: batch **10/10** và **32/32** đạt, cộng dồn **63 run đạt và 126 payment transaction** được xác nhận. [Batch 32 run](../artifacts/realism/local/batch-2026-09-28T14-42-13-947Z-142f7906/summary.json), [batch 10 run](../artifacts/realism/local/batch-2026-09-28T12-20-33-377Z-3abd3996/summary.json).

Một batch 50 run dừng đúng cách ở **18/50**: ổ hệ thống chỉ còn 0.05 GB, RocksDB trong WSL lỗi `Input/output error`, validator panic ở `solReplayStage`. Runner ghi `incomplete` rồi dừng thay vì thử tiếp vào validator đã chết, và **không invariant nào của Sentinel bị vi phạm**. [Báo cáo dừng](../artifacts/realism/local/batch-2026-09-28T12-22-23-016Z-dd6308a6/summary.json).

## Dung lượng đĩa ledger

Ledger nằm trong image WSL (`C:\Users\<user>\AppData\Local\wsl\{...}\ext4.vhdx`), nên khi ổ đó hết chỗ thì append của RocksDB lỗi `Input/output error` và validator dừng giữa batch. Kiểm tra trống trước khi chạy dài: `Get-Volume -DriveLetter C`. Chuyển image sang ổ còn chỗ, dữ liệu được giữ nguyên (máy này đã chuyển sang `D:\wsl\Ubuntu`):

```powershell
wsl --shutdown
wsl --export Ubuntu D:\wsl\ubuntu-backup.tar     # backup trước khi chuyển
wsl --manage Ubuntu --move D:\wsl\Ubuntu
```

Cần WSL ≥ 2.0 (máy này dùng 2.5.9). Launcher dùng `--limit-blockstore-size 10000` thay cho `--limit-ledger-size` đã deprecated trong Agave ≥ 2.3, nên blockstore không phình vô hạn; ledger giữ khoảng 0.6 GB qua 32 run liên tiếp.

Genesis của ledger kiểm tra: `HWyaTF3X8h1sWPy6R25Qx6BxRa7CSDdZL1awX1MHwgoL`. Giao dịch được xác nhận trên private local ledger, không gửi tới mạng công khai. Đây là kiểm thử tích hợp lặp lại (63 run đạt, 126 payment transaction), chưa phải stress test dài hạn, đo hiệu năng production hay kiểm định consensus phân tán.
