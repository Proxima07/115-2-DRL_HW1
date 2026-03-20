from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import random

app = Flask(__name__)
# 啟用 CORS，允許你的純前端 HTML 網頁跨網域呼叫這個 API
CORS(app)

# 定義四個方向的動作與座標位移 (Row, Col)
ACTIONS = ['U', 'D', 'L', 'R']
ACTION_OFFSETS = {
    'U': (-1, 0),  # 上
    'D': (1, 0),  # 下
    'L': (0, -1),  # 左
    'R': (0, 1)  # 右
}


@app.route('/api/random', methods=['POST'])
def random_policy():
    # 接收前端傳來的 JSON 資料
    data = request.json
    n = data.get('n')
    start = tuple(data.get('start'))
    end = tuple(data.get('end'))

    # 將障礙物列表轉換為 Set
    obstacles = set(tuple(obs) for obs in data.get('obstacles'))

    # 生成隨機策略 (Random Policy)
    # 為每個單元格隨機挑選一個方向 ('U', 'D', 'L', 'R')
    policy = np.random.choice(ACTIONS, size=(n, n)).tolist()

    # 把終點和障礙物的位置在策略矩陣中標記出來
    policy[end[0]][end[1]] = 'G'  # Goal (終點)
    for r, c in obstacles:
        policy[r][c] = 'O'  # Obstacle (障礙物)

    # 策略評估 (Policy Evaluation) - 使用 Bellman Equation
    V = np.zeros((n, n))  # 初始化價值矩陣 V(s) = 0
    gamma = 0.9  # 折扣因子 (Discount Factor)
    theta = 0.0001  # 收斂閾值 (Threshold)
    reward_step = -1  # 每走一步的懲罰值 (Reward)

    while True:
        delta = 0
        new_V = np.copy(V)

        for r in range(n):
            for c in range(n):
                state = (r, c)

                # 終點和障礙物的價值永遠為 0，不參與更新
                if state == end or state in obstacles:
                    continue

                # 取得當下狀態在「隨機策略」下的行動
                action = policy[r][c]
                dr, dc = ACTION_OFFSETS[action]
                next_r, next_c = r + dr, c + dc

                # 檢查是否超出邊界，或撞到障礙物
                if next_r < 0 or next_r >= n or next_c < 0 or next_c >= n or (next_r, next_c) in obstacles:
                    # 如果撞牆或撞障礙物，狀態不變 (留在原地)
                    next_r, next_c = r, c

                # Bellman Equation 核心算式 確定的隨機策略 (Deterministic Random Policy)：
                # V(s) = R(s, a) + gamma * V(s')
                v = reward_step + gamma * V[next_r, next_c]
                new_V[r, c] = v

                # 計算更新幅度的最大值
                delta = max(delta, abs(v - V[r, c]))

        V = new_V

        # 如果所有狀態的更新幅度都小於 theta，代表收斂，跳出迴圈
        if delta < theta:
            break

    # 準備回傳資料 (四捨五入到小數點第二位)
    rounded_values = np.round(V, 2).tolist()

    return jsonify({
        'values': rounded_values,
        'policy': policy
    })


@app.route('/api/evaluate', methods=['POST'])
def evaluate_policy():
    data = request.json
    n = data.get('n')
    start = tuple(data.get('start'))
    end = tuple(data.get('end'))
    obstacles = set(tuple(obs) for obs in data.get('obstacles'))

    V = np.zeros((n, n))
    gamma = 0.9
    theta = 1e-4
    reward_step = -1

    # Value Iteration (價值迭代：找尋最佳 V 值)
    while True:
        delta = 0
        new_V = np.copy(V)

        for r in range(n):
            for c in range(n):
                state = (r, c)
                if state == end or state in obstacles:
                    continue

                # 尋找四個方向中，價值最大 (max) 的行動
                max_v = -float('inf')
                for action in ACTIONS:
                    dr, dc = ACTION_OFFSETS[action]
                    next_r, next_c = r + dr, c + dc

                    if next_r < 0 or next_r >= n or next_c < 0 or next_c >= n or (next_r, next_c) in obstacles:
                        next_r, next_c = r, c

                    # 計算該方向的價值
                    v = reward_step + gamma * V[next_r, next_c]
                    if v > max_v:
                        max_v = v

                # 更新為最大的價值
                new_V[r, c] = max_v
                delta = max(delta, abs(max_v - V[r, c]))

        V = new_V
        if delta < theta:
            break

    # Extract Policy (根據算出的 V 導出貪婪策略)
    policy = [[[] for _ in range(n)] for _ in range(n)]  # 變成可以裝多個箭頭的陣列

    for r in range(n):
        for c in range(n):
            state = (r, c)
            if state == end:
                policy[r][c] = ['G']
            elif state in obstacles:
                policy[r][c] = ['O']
            else:
                max_v = -float('inf')
                best_actions = []

                # 再次檢查四個方向，找出所有能達到 max_v 的行動 (處理平手情況)
                for action in ACTIONS:
                    dr, dc = ACTION_OFFSETS[action]
                    next_r, next_c = r + dr, c + dc

                    if next_r < 0 or next_r >= n or next_c < 0 or next_c >= n or (next_r, next_c) in obstacles:
                        next_r, next_c = r, c

                    v = reward_step + gamma * V[next_r, next_c]

                    # 浮點數比較需要允許極小誤差 (1e-5)
                    if v > max_v + 1e-5:
                        max_v = v
                        best_actions = [action]  # 發現更好的，清空舊的
                    elif abs(v - max_v) <= 1e-5:
                        best_actions.append(action)  # 分數一樣好，加入並列名單

                policy[r][c] = best_actions


    # 追蹤最佳路徑 (Trace Optimal Path)

    optimal_path = []
    current_state = start
    visited = set()  # 用來防止陷入無限迴圈

    # 模擬 Agent 從起點開始，照著算出來的 Policy 走到終點
    while current_state != end and current_state not in visited:
        optimal_path.append(list(current_state))
        visited.add(current_state)

        r, c = current_state
        actions = policy[r][c]

        # 如果發生意外狀況（撞牆或終點），跳出
        if not actions or actions[0] in ['G', 'O']:
            break

        # 會有多個方向可以走，選 第一個選項
        best_action = actions[0]
        dr, dc = ACTION_OFFSETS[best_action]
        current_state = (r + dr, c + dc)

    # 把終點也加進路徑中
    if current_state == end:
        optimal_path.append(list(end))

    rounded_values = np.round(V, 2).tolist()

    return jsonify({
        'values': rounded_values,
        'policy': policy,
        'path': optimal_path
    })


if __name__ == '__main__':
    # 啟動伺服器於 port 5000
    app.run(debug=True, port=5000)
