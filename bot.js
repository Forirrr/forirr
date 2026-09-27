const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ==============================
// SUPABASE
// ==============================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ==============================
// TELEGRAM BOT
// ==============================

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не найден!');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true
});

console.log('✅ Telegram-бот запущен!');

// ==============================
// ДНИ НЕДЕЛИ
// ==============================

const days = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье'
};

// ==============================
// /START И /GROUPS
// ==============================

bot.onText(/\/(start|groups)/, async (msg) => {

    const chatId = msg.chat.id;

    try {

        const { data: groups, error } = await supabase
            .from('groups')
            .select('id, name')
            .order('name');

        if (error) {
            console.error('Ошибка groups:', error);

            return bot.sendMessage(
                chatId,
                '❌ Не удалось загрузить список групп.'
            );
        }

        if (!groups || groups.length === 0) {
            return bot.sendMessage(
                chatId,
                '📚 В базе данных пока нет групп.'
            );
        }

        const keyboard = groups.map(group => [
            {
                text: `📚 ${group.name}`,
                callback_data: `group_${group.id}`
            }
        ]);

        await bot.sendMessage(
            chatId,
            '📚 *Выберите вашу группу:*',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );

    } catch (error) {

        console.error(error);

        await bot.sendMessage(
            chatId,
            '❌ Произошла ошибка.'
        );
    }
});

// ==============================
// CALLBACK-КНОПКИ
// ==============================

bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    // Убираем "часики" после нажатия кнопки
    await bot.answerCallbackQuery(query.id);

    // ==========================
    // ВЫБОР ГРУППЫ
    // ==========================

    if (data.startsWith('group_')) {

        const groupId = data.replace('group_', '');

        try {

            // Получаем название группы
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {

                return bot.sendMessage(
                    chatId,
                    '❌ Группа не найдена.'
                );
            }

            // Получаем дни, которые есть в расписании
            const { data: schedule, error } = await supabase
                .from('schedule')
                .select('day_of_week')
                .eq('group_id', groupId);

            if (error) {

                console.error('Ошибка schedule:', error);

                return bot.sendMessage(
                    chatId,
                    '❌ Не удалось загрузить расписание.'
                );
            }

            if (!schedule || schedule.length === 0) {

                return bot.sendMessage(
                    chatId,
                    `📚 Группа: *${group.name}*\n\n❌ Расписание пока отсутствует.`,
                    {
                        parse_mode: 'Markdown'
                    }
                );
            }

            // Уникальные дни
            const uniqueDays = [
                ...new Set(
                    schedule.map(row => String(row.day_of_week))
                )
            ];

            // Сортируем дни
            uniqueDays.sort((a, b) => {

                const numA = Number(a);
                const numB = Number(b);

                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }

                return a.localeCompare(b);
            });

            const keyboard = [];

            uniqueDays.forEach(day => {

                const dayName =
                    days[Number(day)] ||
                    day;

                keyboard.push([
                    {
                        text: `📅 ${dayName}`,
                        callback_data: `day_${groupId}_${day}`
                    }
                ]);
            });

            keyboard.push([
                {
                    text: '🏠 Главное меню',
                    callback_data: 'home'
                }
            ]);

            await bot.sendMessage(
                chatId,
                `📚 *Группа: ${group.name}*\n\n📅 Выберите день:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } catch (error) {

            console.error(error);

            await bot.sendMessage(
                chatId,
                '❌ Ошибка при загрузке группы.'
            );
        }
    }

    // ==========================
    // ВЫБОР ДНЯ
    // ==========================

    else if (data.startsWith('day_')) {

        const parts = data.split('_');

        const groupId = parts[1];
        const selectedDay = parts.slice(2).join('_');

        try {

            // Получаем группу
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {

                return bot.sendMessage(
                    chatId,
                    '❌ Группа не найдена.'
                );
            }

            // Получаем расписание
            const { data: schedule, error } = await supabase
                .from('schedule')
                .select('*')
                .eq('group_id', groupId)
                .eq('day_of_week', selectedDay)
                .order('lesson_number', { ascending: true });

            if (error) {

                console.error('Ошибка расписания:', error);

                return bot.sendMessage(
                    chatId,
                    '❌ Не удалось загрузить расписание.'
                );
            }

            const dayName =
                days[Number(selectedDay)] ||
                selectedDay;

            // Если пар нет
            if (!schedule || schedule.length === 0) {

                return bot.sendMessage(
                    chatId,
                    `📚 *${group.name}*\n📅 *${dayName}*\n\n❌ Пар нет.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '⬅️ Назад к дням',
                                        callback_data: `group_${groupId}`
                                    }
                                ],
                                [
                                    {
                                        text: '🏠 Главное меню',
                                        callback_data: 'home'
                                    }
                                ]
                            ]
                        }
                    }
                );
            }

            // Формируем расписание
            let message = '';

            message += `📚 *${group.name}*\n`;
            message += `📅 *${dayName}*\n\n`;

            schedule.forEach((lesson) => {

                message += `━━━━━━━━━━━━━━\n`;

                message += `🔢 *Пара №${lesson.lesson_number}*\n`;

                if (lesson.subject) {
                    message += `📖 ${lesson.subject}\n`;
                }

                if (lesson.teacher) {
                    message += `👨‍🏫 ${lesson.teacher}\n`;
                }

                if (lesson.classroom) {
                    message += `🚪 Кабинет: ${lesson.classroom}\n`;
                }

                message += '\n';
            });

            message += `━━━━━━━━━━━━━━`;

            await bot.sendMessage(
                chatId,
                message,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '⬅️ Другой день',
                                    callback_data: `group_${groupId}`
                                }
                            ],
                            [
                                {
                                    text: '🏠 Главное меню',
                                    callback_data: 'home'
                                }
                            ]
                        ]
                    }
                }
            );

        } catch (error) {

            console.error(error);

            await bot.sendMessage(
                chatId,
                '❌ Ошибка при загрузке расписания.'
            );
        }
    }

    // ==========================
    // ГЛАВНОЕ МЕНЮ
    // ==========================

    else if (data === 'home') {

        try {

            const { data: groups, error } = await supabase
                .from('groups')
                .select('id, name')
                .order('name');

            if (error) {

                return bot.sendMessage(
                    chatId,
                    '❌ Не удалось загрузить группы.'
                );
            }

            const keyboard = groups.map(group => [
                {
                    text: `📚 ${group.name}`,
                    callback_data: `group_${group.id}`
                }
            ]);

            await bot.sendMessage(
                chatId,
                '🏠 *Главное меню*\n\n📚 Выберите группу:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } catch (error) {

            console.error(error);

            await bot.sendMessage(
                chatId,
                '❌ Произошла ошибка.'
            );
        }
    }
});

// ==============================
// ОБРАБОТКА ОШИБОК
// ==============================

bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
