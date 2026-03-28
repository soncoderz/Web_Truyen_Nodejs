package com.example.backend.config;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.example.backend.model.*;
import com.example.backend.repository.*;

@Component
@Order(2)
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true", matchIfMissing = false)
public class DataInitializer implements CommandLineRunner {

    @Autowired private UserRepository userRepository;
    @Autowired private RoleRepository roleRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private AuthorRepository authorRepository;
    @Autowired private StoryRepository storyRepository;
    @Autowired private ChapterRepository chapterRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        if (storyRepository.count() > 0) {
            System.out.println("=== Data already exists, skipping seed ===");
            return;
        }
        System.out.println("=== Seeding sample data ===");

        // --- Users ---
        if (!userRepository.existsByUsername("admin")) {
            User admin = new User("admin", "admin@truyenhub.com", passwordEncoder.encode("123456"));
            Set<Role> adminRoles = new HashSet<>();
            roleRepository.findByName(ERole.ROLE_ADMIN).ifPresent(adminRoles::add);
            roleRepository.findByName(ERole.ROLE_USER).ifPresent(adminRoles::add);
            admin.setRoles(adminRoles);
            userRepository.save(admin);
        }
        if (!userRepository.existsByUsername("reader1")) {
            User reader = new User("reader1", "reader1@gmail.com", passwordEncoder.encode("123456"));
            Set<Role> userRoles = new HashSet<>();
            roleRepository.findByName(ERole.ROLE_USER).ifPresent(userRoles::add);
            reader.setRoles(userRoles);
            userRepository.save(reader);
        }

        // --- Categories ---
        Category catTienHiep = getOrCreateCategory("Tiên Hiệp", "Truyện tu tiên, thần tiên");
        Category catHuyenHuyen = getOrCreateCategory("Huyền Huyễn", "Truyện huyền huyễn, thế giới kỳ ảo");
        Category catDoThi = getOrCreateCategory("Đô Thị", "Truyện đô thị, hiện đại");
        Category catNgonTinh = getOrCreateCategory("Ngôn Tình", "Truyện tình cảm, lãng mạn");
        Category catVoHiep = getOrCreateCategory("Võ Hiệp", "Truyện kiếm hiệp, võ lâm");
        Category catManga = getOrCreateCategory("Manga", "Truyện tranh Nhật Bản");
        Category catAction = getOrCreateCategory("Action", "Hành động, chiến đấu");
        Category catComedy = getOrCreateCategory("Comedy", "Hài hước, giải trí");

        // --- Authors ---
        Author author1 = getOrCreateAuthor("Thiên Tàm Thổ Đậu", "Tác giả Đấu Phá Thương Khung");
        Author author2 = getOrCreateAuthor("Ngã Cật Tây Hồng Thị", "Tác giả Phàm Nhân Tu Tiên");
        Author author3 = getOrCreateAuthor("Đường Gia Tam Thiếu", "Tác giả Đấu La Đại Lục");
        Author author4 = getOrCreateAuthor("Eiichiro Oda", "Tác giả One Piece");
        Author author5 = getOrCreateAuthor("Masashi Kishimoto", "Tác giả Naruto");
        Author author6 = getOrCreateAuthor("Akira Toriyama", "Tác giả Dragon Ball");

        // ===== NOVEL STORIES =====
        Story novel1 = createStory("Đấu Phá Thương Khung",
            "Tam thập niên hà đông, tam thập niên hà tây, mạc khi thiếu niên cùng! Thiên tài thiếu niên Tiêu Viêm từng bước bước lên đỉnh cao đại lục.",
            EStoryStatus.COMPLETED, EStoryType.NOVEL, 15680L,
            "https://upload.wikimedia.org/wikipedia/vi/thumb/7/70/Dau_pha_thuong_khung.jpg/220px-Dau_pha_thuong_khung.jpg",
            new HashSet<>(Arrays.asList(catHuyenHuyen, catTienHiep)), new HashSet<>(List.of(author1)));

        Story novel2 = createStory("Phàm Nhân Tu Tiên",
            "Một thanh niên bình thường bước vào con đường tu tiên, trải qua vô số gian nan, cuối cùng đạt được tiên đạo.",
            EStoryStatus.COMPLETED, EStoryType.NOVEL, 23450L,
            "https://upload.wikimedia.org/wikipedia/vi/2/20/Ph%C3%A0m_Nh%C3%A2n_Tu_Ti%C3%AAn.jpg",
            new HashSet<>(List.of(catTienHiep)), new HashSet<>(List.of(author2)));

        Story novel3 = createStory("Đấu La Đại Lục",
            "Đường Tam, ngoại môn đệ tử của Đường Môn, bắt đầu cuộc hành trình mới trong thế giới Đấu La.",
            EStoryStatus.ONGOING, EStoryType.NOVEL, 34200L,
            "https://upload.wikimedia.org/wikipedia/vi/6/6f/DauLaDaiLuc.jpg",
            new HashSet<>(Arrays.asList(catHuyenHuyen, catVoHiep)), new HashSet<>(List.of(author3)));

        // ===== MANGA STORIES =====
        Story manga1 = createStory("One Piece",
            "Monkey D. Luffy cùng đồng đội Straw Hat Pirates phiêu lưu trên Grand Line tìm kiếm kho báu One Piece để trở thành Vua Hải Tặc.",
            EStoryStatus.ONGOING, EStoryType.MANGA, 98700L,
            "https://upload.wikimedia.org/wikipedia/vi/9/90/One_Piece%2C_Volume_61_Cover_%28Japanese%29.jpg",
            new HashSet<>(Arrays.asList(catManga, catAction, catComedy)), new HashSet<>(List.of(author4)));

        Story manga2 = createStory("Naruto",
            "Uzumaki Naruto, một ninja trẻ với giấc mơ trở thành Hokage - lãnh đạo làng Lá. Câu chuyện về tình bạn, ý chí và sức mạnh.",
            EStoryStatus.COMPLETED, EStoryType.MANGA, 67800L,
            "https://upload.wikimedia.org/wikipedia/vi/4/4e/Narutocover.jpg",
            new HashSet<>(Arrays.asList(catManga, catAction)), new HashSet<>(List.of(author5)));

        Story manga3 = createStory("Dragon Ball",
            "Son Goku từ cậu bé miền núi trở thành chiến binh mạnh nhất vũ trụ. Hành trình tìm kiếm Ngọc Rồng và bảo vệ Trái Đất.",
            EStoryStatus.COMPLETED, EStoryType.MANGA, 45600L,
            "https://upload.wikimedia.org/wikipedia/vi/3/36/Dragon_Ball_manga_volume_1.png",
            new HashSet<>(Arrays.asList(catManga, catAction, catComedy)), new HashSet<>(List.of(author6)));

        // ===== CROSS-LINK manga ↔ novel =====
        // Đấu Phá Thương Khung novel ↔ manga version
        Story mangaDPTK = createStory("Đấu Phá Thương Khung (Manga)",
            "Phiên bản truyện tranh của Đấu Phá Thương Khung - hành trình tu luyện Đấu Khí của Tiêu Viêm.",
            EStoryStatus.ONGOING, EStoryType.MANGA, 12800L,
            "https://upload.wikimedia.org/wikipedia/vi/thumb/7/70/Dau_pha_thuong_khung.jpg/220px-Dau_pha_thuong_khung.jpg",
            new HashSet<>(Arrays.asList(catManga, catHuyenHuyen)), new HashSet<>(List.of(author1)));

        // Link them
        novel1.setRelatedStoryIds(List.of(mangaDPTK.getId()));
        storyRepository.save(novel1);
        mangaDPTK.setRelatedStoryIds(List.of(novel1.getId()));
        storyRepository.save(mangaDPTK);

        Story mangaDLDL = createStory("Đấu La Đại Lục (Manga)",
            "Phiên bản truyện tranh của Đấu La Đại Lục - Đường Tam và hành trình Hồn Sư.",
            EStoryStatus.ONGOING, EStoryType.MANGA, 9500L,
            "https://upload.wikimedia.org/wikipedia/vi/6/6f/DauLaDaiLuc.jpg",
            new HashSet<>(Arrays.asList(catManga, catHuyenHuyen)), new HashSet<>(List.of(author3)));

        novel3.setRelatedStoryIds(List.of(mangaDLDL.getId()));
        storyRepository.save(novel3);
        mangaDLDL.setRelatedStoryIds(List.of(novel3.getId()));
        storyRepository.save(mangaDLDL);

        // ===== NOVEL CHAPTERS =====
        createTextChapter(novel1.getId(), 1, "Vân Lam Tông",
            "Đại lục Đấu Khí, không có hoa lệ chi ma pháp, có đích chỉ phồn hoa đích đấu khí!\n\nTại đại lục này, đấu khí tu luyện tiêu chuẩn được chia thành: Đấu Giả, Đấu Sư, Đại Đấu Sư, Đấu Linh, Đấu Vương, Đấu Hoàng, Đấu Tông, Đấu Tôn, Đấu Thánh, Đấu Đế.\n\nTiêu Viêm, thiếu niên mười lăm tuổi, đang đứng ở luyện công trường của Tiêu gia tộc. Gió lạnh thổi qua, lay động mái tóc đen nhánh.\n\n\"Tiêu Viêm, dùng chưởng lực đánh vào trụ luyện!\" Một thanh âm trầm hùng vang lên.\n\nTiêu Viêm gật đầu, vận tụ đấu khí, một quyền đánh ra...");

        createTextChapter(novel1.getId(), 2, "Thiên Tài Trở Thành Phế Vật",
            "\"Đấu khí giai đoạn bảy... ba năm trước, hắn còn là thiên tài gia tộc, bây giờ...\"\n\nNhững lời thì thầm vang lên xung quanh, Tiêu Viêm cắn chặt răng. Ba năm qua, đấu khí không ngừng thụt lùi.\n\nNhưng Tiêu Viêm biết, sự suy yếu này không bình thường. Trong một lần vô tình, hắn phát hiện nhẫn đen trên tay phát ra ánh sáng kỳ lạ...\n\n\"Tiểu tử, rốt cuộc ngươi cũng phát hiện ta rồi.\" Một giọng nói cổ xưa vang lên.");

        createTextChapter(novel1.getId(), 3, "Dược Lão",
            "\"Ta là Dược Lão, linh hồn cư ngụ trong Xuyên Vân Nhẫn.\"\n\nTiêu Viêm kinh ngạc nhìn vào nhẫn đen. Dược Lão - một Đấu Đế tồn tại từ nghìn năm trước.\n\n\"Lý do đấu khí thụt lùi, bởi ta cần hấp thu để duy trì linh hồn. Nhưng bây giờ ta sẽ bù đắp.\"\n\nDược Lão truyền thụ công pháp cổ xưa - Phần Quyết.");

        createTextChapter(novel2.getId(), 1, "Khởi Đầu Tu Tiên",
            "Hàn Lập, thiếu niên bình thường ở ngôi làng nhỏ, vô tình được nhận vào Thất Huyền Môn.\n\nBước chân vào thế giới tu tiên, Hàn Lập bắt đầu hành trình dài vô tận.\n\n\"Phàm nhân cũng có thể tu tiên!\" - sư phụ bảo hắn.");

        createTextChapter(novel2.getId(), 2, "Luyện Đan",
            "Sau nửa năm khổ tu, Hàn Lập tiếp xúc với thuật luyện đan. Dù tư chất tầm thường, nhưng hắn có thiên phú nhận biết linh dược.\n\n\"Đây là... Thiên Niên Linh Chi?\" Hàn Lập nhận diện thanh dược.\n\nSư phụ gật đầu hài lòng.");

        createTextChapter(novel3.getId(), 1, "Đường Tam",
            "Đường Tam bước xuống Quỷ Kiến Sầu đỉnh. Khi mở mắt, hắn nằm trên giường gỗ trong căn phòng xa lạ. Hắn đã trùng sinh!\n\nThế giới Đấu La, nơi Hồn Sư là nghề nghiệp cao quý nhất...");

        // ===== MANGA CHAPTERS (with image pages) =====
        createMangaChapter(manga1.getId(), 1, "Romance Dawn",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-1/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-1/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-1/3.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-1/4.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-1/5.jpg"
            ));

        createMangaChapter(manga1.getId(), 2, "Đội mũ rơm",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-2/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-2/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/one-piece/chapters/chapter-2/3.jpg"
            ));

        createMangaChapter(manga2.getId(), 1, "Uzumaki Naruto",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-1/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-1/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-1/3.jpg",
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-1/4.jpg"
            ));

        createMangaChapter(manga2.getId(), 2, "Konohamaru",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-2/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-2/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/naruto/chapters/chapter-2/3.jpg"
            ));

        createMangaChapter(manga3.getId(), 1, "Bulma và Son Goku",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/dragon-ball/chapters/chapter-1/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/dragon-ball/chapters/chapter-1/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/dragon-ball/chapters/chapter-1/3.jpg"
            ));

        createMangaChapter(mangaDPTK.getId(), 1, "Chương 1: Thiên Tài Suy Sụp",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/dau-pha-thuong-khung/chapters/chapter-1/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/dau-pha-thuong-khung/chapters/chapter-1/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/dau-pha-thuong-khung/chapters/chapter-1/3.jpg"
            ));

        createMangaChapter(mangaDLDL.getId(), 1, "Chương 1: Đường Tam Trùng Sinh",
            Arrays.asList(
                "https://img.otruyenapi.com/uploads/comics/dau-la-dai-luc/chapters/chapter-1/1.jpg",
                "https://img.otruyenapi.com/uploads/comics/dau-la-dai-luc/chapters/chapter-1/2.jpg",
                "https://img.otruyenapi.com/uploads/comics/dau-la-dai-luc/chapters/chapter-1/3.jpg"
            ));

        System.out.println("=== Sample data seeded successfully! ===");
        System.out.println("Admin: admin / 123456  |  User: reader1 / 123456");
        System.out.println("Novels: " + 3 + " | Manga: " + 5 + " (2 cross-linked)");
    }

    private Category getOrCreateCategory(String name, String desc) {
        return categoryRepository.findAll().stream()
            .filter(c -> c.getName().equals(name)).findFirst()
            .orElseGet(() -> categoryRepository.save(new Category(name, desc)));
    }

    private Author getOrCreateAuthor(String name, String desc) {
        return authorRepository.findAll().stream()
            .filter(a -> a.getName().equals(name)).findFirst()
            .orElseGet(() -> authorRepository.save(new Author(name, desc)));
    }

    private Story createStory(String title, String desc, EStoryStatus status, EStoryType type,
                               Long views, String cover, Set<Category> cats, Set<Author> auths) {
        Story s = new Story(title, desc, status);
        s.setType(type);
        s.setViews(views);
        s.setCoverImage(cover);
        s.setCategories(cats);
        s.setAuthors(auths);
        return storyRepository.save(s);
    }

    private void createTextChapter(String storyId, int num, String title, String content) {
        chapterRepository.save(new Chapter(storyId, num, title, content));
    }

    private void createMangaChapter(String storyId, int num, String title, List<String> pages) {
        Chapter ch = new Chapter(storyId, num, title, null);
        ch.setPages(pages);
        chapterRepository.save(ch);
    }
}
