API_BASE là đường dẫn đến Backend. Khi test local sẽ là http://localhost:3000 nhưng khi deployed sẽ là đường link khác Vì vậy nên đặt nó là biến như sau:

``` export const API_BASE =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://my-backend.onrender.com";
```

(Tôi sẽ đưa link backend sau khi đã deployed.)

Nhớ thêm ***credentials: "include"*** mỗi lần fetch. Ví dụ:

```
const res = await fetch(`${API_BASE}/api/me`, {
    credentials: "include"
});

```

# I. TÀI KHOẢN

1. Tạo tài khoản: 

Submit form register theo giao thức POST thông qua API:

***{API_BASE}/api/register***

- Thành công: **{ success: true }** bằng json;
- Nếu thất bại: object **{errors: []}** bằng json.

Điều kiện username:
- Dài từ 3-10 chữ cái, bao gồm a-z, A-Z, 0-9.
Điều kiện password:
- Dài từ 8-50 chữ cái

2. Đăng nhập tài khoản:

Submit form login theo giao thức POST thông qua API:

***{API_BASE}/api/login***

- Thành công: object **{ success: true }** bằng json và nhận cookie. 
- Thất bại: object **{errors: []}** bằng json chứa lỗi không tồn tại username/password.

Khi có lỗi thì nên cảnh báo như sau:
```
  const data = await res.json();

  if (!res.ok) {
    alert(data.errors.join("\n"));
    return;
  }

```

3. Đăng xuất:

Fetch theo giao thức POST qua API:

***{API_BASE}/api/log-out***

Nếu thành công sẽ xóa cookie đăng nhập và trả về object **{ success: true }** bằng json.


4. Cookie:
Cookie khi đăng nhập có tên là **logged**. Cookie có thời hạn trong 7 ngày. Token trong cookie bao gồm *username* và *id* của user, có thể trực tiếp access ở frontend.


5. Xác nhận tài khoản:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/me***

- Thành công: object **{user: decoded}** bằng json;
- Thất bại: object **{ error: "Unauthorized" }** bằng json và status 401.

# II. MỤC HANDBOOK

Cấu trúc của Handbook gồm các trang để chứa các mục bữa ăn trong ngày. Ở đây ta gọi chung các trang là Tab và các mục chứa các bữa ăn là Block.

Tab bao gồm *tab_name* (string). Block bao gồm *day_name* (string) (tên của ngày do user đặt, VD: ngày 1, day 1, thứ Hai,...), *breakfast* (string) (bữa ăn sáng), *lunch* (string), *diner* (string).

Các bữa breakfast, lunch, diner chứa string theo cấu trúc:

***món ăn 1: khối lượng, món ăn 2: số lượng, ....***

Có thể giải nén bằng cách đầu tiên split dấu "," và vào array, và sau đó split dấu ":" cho mỗi element của array.

**Lưu ý: các giao thức dưới đây chỉ thành công nếu user đã đăng nhập. Trong trường hợp chưa đăng nhập, fetch sẽ trả về status 401 và object *{error: "Unauthorized"}***

1. Tạo tab:

Gửi form chứa *name* là tên *tab* theo giao thức POST qua API:
***{API_BASE}/api/create-tab***

- Thành công: object **{ success: true, tab_id: id }** bằng json với *tab_id* là *id* của tab trong database, và status 201;

- Thất bại: object **{ error: "Unauthorized" }** bằng json và status 401.

2. Lấy tất cả tabs:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/tabs***

- Thành công: object **{success: true, tabs: [ {*id*, *name*}, {} ] }** với *id* là *id* của *tab*, *name* là tên *tab*, status 200;

- Thất bại: sẽ object **{ error: "Tab not found" }** bằng json và status 404.

3. Lấy một tab:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/tab/tab_id*** với *tab_id* là *id* của tab cần lấy.

- Thành công: object **{ success: true, tab: {*id*, *name*} }** với *id* là *id* của *tab*, *name* là tên *tab*, status 200;

- Thất bại: sẽ object **{error: "Tab not found"}** bằng json và status 404.

4. Đổi tên tab:
Gửi form chứa *name* là tên cần đổi giao thức PUT qua API:

***{API_BASE}/api/edit-tab/tab_id***

- Thành công: object { success: true } và status 200;
- Thất bại: sẽ object **{error: "Tab not found"}** bằng json và status 404.

5. Xóa tab:
Fetch theo giao thức DELETE qua API:

***{API_BASE}/api/delete-tab/tab_id***

- Thành công: object { success: true } và status 200;
- Thất bại: sẽ object **{error: "Tab not found"}** bằng json và status 404.


6. Tạo block:

Gửi form bao gồm **{ *day_name*, *breakfast*, *lunch*, *diner* }** theo giao thức POST qua API:

***{API_BASE}/api/tab/tab_id/create-block*** với *tab_id* là *id* của *tab*.

- Thành công: object **{success: true, block_id: id}** bằng json với *block_id* là *id* của block vừa tạo, status 201;

Nếu thất bại sẽ trả về object **{ errors: "Forbidden" }** bằng json và status 403.

7. Chỉnh sửa block:

Gửi form bao gồm **{ *day_name*, *breakfast*, *lunch*, *diner* }** theo giao thức PUT qua API:

***{API_BASE}/api/edit-block/tab/tab_id/block/block_id*** với *tab_id* là *id* của *tab* và *block_id* là *id* của *block* cần sửa.

- Thành công: object **{success: true}** bằng json, status 200;
- Thất bại:  object **{error: "Tab not found"}** hoặc **{error: "Block not found"}** bằng json tùy thuộc vào việc không tồn tại *tab* hoặc *block*, status 404.


8. Xóa một block:

Fetch theo giao thức POST qua API:

***{API_BASE}/api/delete-block/tab/tab_id/block/block_id*** với *tab_id* là *id* của *tab* và *block_id* là *id* của *block* cần xóa.

- Thành công: object **{success: true}** bằng json, status 200;

- Thất bại: object **{error: "Tab not found"}** hoặc **{error: "Block not found"}** bằng json tùy thuộc vào việc không tồn tại *tab* hoặc *block*, status 404.



9. Lấy tất cả blocks:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/tab/tab_id/blocks*** với *tab_id* là *id* của tab.

- Thành công: object **{success: true, tabs: [ {*id*, *day_name*, *breakfast*, *lunch*, *diner* }, {} ] }** với *id* là *id* của *block*;

- Thất bại: object **{error: "Tab not found"}**, status 404.

10. Lấy một block:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/tab/tab_id/block/block_id*** với *tab_id* là *id* của *tab* và *block_id* là *id* của *block*.

- Thành công: object **{ success: true, block: {*day_name*, *breakfast*, *lunch*, *diner* } }** bằng json, status 200;

- Thất bại: object **{error: "Tab not found"}** hoặc **{error: "Block not found"}** bằng json tùy thuộc vào việc không tồn tại *tab* hoặc *block*, status 404.

11. Nhận feedback từ AI:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/tab/tab_id/ai-feedback*** với *tab_id* là *id* của *tab*.

- Thành công:
  + object: **{ success: true, chat_content: ""}** nếu AI trả lời thành công, status 200;
  * object **{success: false, "error": "rate_limit_exceeded" , "message": "API key token quota exceeded", retry_after: seconds}** nếu AI hết lượt trả lời tạm thời, status 429;

- Thất bại: object **{ error: "Tab not found" }** bằng json, status 404.



# III. MỤC CHATBOT

**Lưu ý: các giao thức dưới đây chỉ thành công nếu user đã đăng nhập. Trong trường hợp chưa đăng nhập, fetch sẽ trả về status 401 và object *{error: "Unauthorized"}***

Ta gọi chung *thread* là nơi chứa các đoạn *chat*.

1. Tạo thread chat:
Gửi form gồm *name* là tên của *thread* theo giao thức POST qua API.

***{API_BASE}/api/create-thread***

- Thành công: object **{success: true, thread_id: id}** với *thread_id* là *id* của *thread* vừa tạo, status 201;
- Thất bại: object **{ error: "Unauthorized" }** bằng json và status 401.


2. Đổi tên thread:

Gửi form gồm *name* là tên cần đổi theo giao thức PUT qua API:

***{API_BASE}/api/edit-thread/thread_id***

- Thành công: object **{success: true}**, status 200;
- Thất bại: object **{error: "Thread not found"}**, status 404.


3. Xóa thread:
Fetch theo giao thức DELETE qua API:

***{API_BASE}/api/delete-thread/thread_id***

- Thành công: object **{success: true}**, status 200;
- Thất bại: object **{error: "Thread not found"}**, status 404.


4. Lấy tất cả threads:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/threads***

- Thành công: object **{success: true, threads: [ {*id*, *thread_name*}, {} ]}** với *id* là *id* của *thread*, status 200;
- Thất bại: object **{error: "Thread not found"}**, status 404.

5. Lấy một thread

Fetch theo giao thức GET qua API:

***{API_BASE}/api/thread/thread_id***

- Thành công: object **{success: true, thread: {*id*, *thread_name*} }** với *id* là *id* của *thread*, status 200;
- Thất bại: object **{error: "Thread not found"}**, status 404.

6. Gửi chat:

Gửi form gồm *content* là nội dung *chat* theo giao thức POST qua API:

***{API_BASE}/api/thread/thread_id/send-chat*** với *thread_id* là *id* của *thread*.

- Thành công:
  + object: **{ success: true, chat_content: ""}** nếu AI trả lời thành công, status 200;
  * object **{success: false, "error": "rate_limit_exceeded" , "message": "API key token quota exceeded", retry_after: seconds}** nếu AI hết lượt trả lời tạm thời, status 429;

- Thất bại: object **{ error: "Thread not found" }** bằng json, status 404.


7. Lấy tất cả chat:

Fetch theo giao thức GET qua API:

***{API_BASE}/api/thread/thread_id/chats*** với *thread_id* là *id* của *thread*.

- Thành công: object **{ success: true, chats: [ {*id*, *role*, *content*}, {} ] }** với *id* là *id* của *chat*, *role* là "user" nếu là của người dùng hoặc "system" nếu là của AI, *content* là nội dung chat, status 200.

- Thất bại: object **{ error: "Thread not found" }** bằng json, status 404.


