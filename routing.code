/**
 * Алгоритм A* для поиска доступного маршрута
 * Учитывает параметры доступности из профиля пользователя
 */

// Расчёт расстояния между двумя точками (формула Haversine)
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Радиус Земли в метрах
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Проверяет, доступно ли ребро для данного профиля пользователя
 */
export function isEdgeAccessible(edge, profile) {
    // Проверка высоты бордюра
    if (edge.curb > profile.maxCurbHeight && !edge.hasRamp) {
        return false;
    }

    // Проверка уклона
    if (edge.slope > profile.maxSlope) {
        return false;
    }

    // Проверка ширины прохода
    if (edge.width < profile.minWidth) {
        return false;
    }

    // Временные ограничения (ремонт)
    if (edge.temporary === 'repair' && profile.mobilityType === 'wheelchair') {
        return false;
    }

    return true;
}

/**
 * Рассчитывает вес ребра на основе его доступности
 * Чем менее доступно ребро, тем выше его вес
 */
export function calculateEdgeWeight(edge, profile) {
    let weight = edge.distance;

    // Штраф за тип покрытия
    const surfacePenalty = {
        'asphalt': 1.0,
        'concrete': 1.0,
        'wood': 1.1,
        'gravel': 1.5,
        'cobblestone': 1.8,
        'stone': 2.0,
        'sand': 2.5
    };
    weight *= (surfacePenalty[edge.surface] || 1.2);

    // Штраф за уклон
    if (edge.slope > 0) {
        const slopePenalty = 1 + (edge.slope / 10);
        weight *= slopePenalty;

        // Дополнительный штраф для колясок без сопровождающего
        if (profile.mobilityType === 'wheelchair' && edge.slope > 5) {
            weight *= 1.5;
        }
    }

    // Штраф за бордюр без пандуса
    if (edge.curb > 0 && !edge.hasRamp) {
        const curbPenalty = 1 + (edge.curb / 5);
        weight *= curbPenalty;
    }

    // Штраф за узкий проход
    if (edge.width < 150) {
        const widthPenalty = 1 + ((150 - edge.width) / 100);
        weight *= widthPenalty;
    }

    // Штраф за временные ограничения
    if (edge.temporary) {
        weight *= 2.0;
    }

    return weight;
}

/**
 * Определяет уровень доступности ребра
 * @returns {'accessible' | 'partial' | 'inaccessible'}
 */
export function getEdgeAccessibilityLevel(edge, profile) {
    if (!isEdgeAccessible(edge, profile)) {
        return 'inaccessible';
    }

    // Частично доступно: есть барьеры, но проходимо
    if (
        edge.curb > 3 ||
        edge.slope > 5 ||
        edge.surface === 'cobblestone' ||
        edge.surface === 'gravel' ||
        edge.temporary
    ) {
        return 'partial';
    }

    return 'accessible';
}

/**
 * Построение графа смежности из данных
 */
export function buildAdjacencyList(nodes, edges) {
    const adjacencyList = new Map();

    // Инициализация списка для каждого узла
    nodes.forEach(node => {
        adjacencyList.set(node.id, []);
    });

    // Добавление рёбер (граф неориентированный)
    edges.forEach(edge => {
        adjacencyList.get(edge.from)?.push({
            to: edge.to,
            edge: edge
        });
        adjacencyList.get(edge.to)?.push({
            to: edge.from,
            edge: edge
        });
    });

    return adjacencyList;
}

/**
 * Алгоритм A* для поиска оптимального доступного маршрута
 */
export function findAccessibleRoute(graph, nodes, startId, endId, profile) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const startNode = nodeMap.get(startId);
    const endNode = nodeMap.get(endId);

    if (!startNode || !endNode) {
        return { path: [], edges: [], totalDistance: 0, issues: [] };
    }

    // Эвристика: расстояние до цели
    const heuristic = (nodeId) => {
        const node = nodeMap.get(nodeId);
        return calculateDistance(node.lat, node.lng, endNode.lat, endNode.lng);
    };

    // Приоритетная очередь (простая реализация)
    const openSet = [{ id: startId, fScore: heuristic(startId) }];
    const cameFrom = new Map();
    const gScore = new Map();
    const edgeUsed = new Map();

    gScore.set(startId, 0);

    while (openSet.length > 0) {
        // Извлечение узла с минимальным fScore
        openSet.sort((a, b) => a.fScore - b.fScore);
        const current = openSet.shift();

        if (current.id === endId) {
            // Восстановление пути
            return reconstructPath(cameFrom, edgeUsed, current.id, gScore.get(endId), profile);
        }

        const neighbors = graph.get(current.id) || [];

        for (const neighbor of neighbors) {
            // Пропуск недоступных рёбер
            if (!isEdgeAccessible(neighbor.edge, profile)) {
                continue;
            }

            const tentativeGScore = gScore.get(current.id) + calculateEdgeWeight(neighbor.edge, profile);

            if (!gScore.has(neighbor.to) || tentativeGScore < gScore.get(neighbor.to)) {
                cameFrom.set(neighbor.to, current.id);
                edgeUsed.set(neighbor.to, neighbor.edge);
                gScore.set(neighbor.to, tentativeGScore);

                const fScore = tentativeGScore + heuristic(neighbor.to);

                // Добавление в очередь, если ещё не там
                if (!openSet.find(n => n.id === neighbor.to)) {
                    openSet.push({ id: neighbor.to, fScore });
                }
            }
        }
    }

    // Путь не найден
    return { path: [], edges: [], totalDistance: 0, issues: [], notFound: true };
}

/**
 * Восстановление пути из результатов A*
 */
function reconstructPath(cameFrom, edgeUsed, endId, totalWeight, profile) {
    const path = [endId];
    const edges = [];
    const issues = [];
    let current = endId;
    let totalDistance = 0;

    while (cameFrom.has(current)) {
        const prev = cameFrom.get(current);
        const edge = edgeUsed.get(current);

        path.unshift(prev);
        edges.unshift(edge);
        totalDistance += edge.distance;

        // Сбор информации о проблемных участках
        const accessibility = getEdgeAccessibilityLevel(edge, profile);
        if (accessibility !== 'accessible') {
            const issue = {
                edge: edge,
                level: accessibility,
                reasons: []
            };

            if (edge.curb > 3) {
                issue.reasons.push(`Бордюр ${edge.curb} см`);
            }
            if (edge.slope > 5) {
                issue.reasons.push(`Уклон ${edge.slope}%`);
            }
            if (edge.surface === 'cobblestone' || edge.surface === 'gravel') {
                issue.reasons.push(`Покрытие: ${edge.surface === 'cobblestone' ? 'брусчатка' : 'гравий'}`);
            }
            if (edge.temporary) {
                issue.reasons.push('Временные ограничения');
            }
            if (!edge.hasRamp && edge.curb > 0) {
                issue.reasons.push('Нет пандуса');
            }

            issues.push(issue);
        }

        current = prev;
    }

    return {
        path,
        edges,
        totalDistance,
        totalWeight,
        issues,
        accessibilityScore: calculateAccessibilityScore(edges, profile)
    };
}

/**
 * Рассчитывает общий уровень доступности маршрута (0-100)
 */
function calculateAccessibilityScore(edges, profile) {
    if (edges.length === 0) return 100;

    let totalScore = 0;

    edges.forEach(edge => {
        const level = getEdgeAccessibilityLevel(edge, profile);
        switch (level) {
            case 'accessible':
                totalScore += 100;
                break;
            case 'partial':
                totalScore += 60;
                break;
            case 'inaccessible':
                totalScore += 0;
                break;
        }
    });

    return Math.round(totalScore / edges.length);
}

/**
 * Получает координаты для отображения маршрута на карте
 */
export function getRouteCoordinates(path, nodeMap) {
    return path.map(nodeId => {
        const node = nodeMap.get(nodeId);
        return [node.lat, node.lng];
    });
}

/**
 * Форматирует расстояние для отображения
 */
export function formatDistance(meters) {
    if (meters < 1000) {
        return `${Math.round(meters)} м`;
    }
    return `${(meters / 1000).toFixed(1)} км`;
}

/**
 * Оценивает время в пути на основе профиля
 */
export function estimateTime(distance, profile) {
    // Средняя скорость в м/мин
    const speeds = {
        'wheelchair': 40,
        'wheelchair_assisted': 50,
        'stroller': 60,
        'crutches': 30
    };

    const speed = speeds[profile.mobilityType] || 50;
    const minutes = Math.ceil(distance / speed);

    if (minutes < 60) {
        return `${minutes} мин`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} ч ${remainingMinutes} мин`;
}
